// Capacitor 프로젝트를 다시 동기화해도 푸시, 딥링크, 알림 아이콘 설정을 동일하게 복원합니다.
import fs from "node:fs/promises";
import path from "node:path";

const IOS_APP_DELEGATE = path.resolve("ios/App/App/AppDelegate.swift");
const IOS_INFO_PLIST = path.resolve("ios/App/App/Info.plist");
const ANDROID_MANIFEST = path.resolve("android/app/src/main/AndroidManifest.xml");
const ANDROID_NOTIFICATION_ICON = path.resolve("android/app/src/main/res/drawable/ic_stat_icl.xml");
const ANDROID_GRADLE_PROPERTIES = path.resolve("android/gradle.properties");
const ANDROID_APP_GRADLE = path.resolve("android/app/build.gradle");
const ANDROID_RELEASE_GRADLE = path.resolve("android/app/icl-release.gradle");
const ANDROID_PROGUARD_RULES = path.resolve("android/app/proguard-rules.pro");
const APP_VERSION_FILE = path.resolve("app-version.json");
const KEYSTORE_PROPERTIES = path.resolve("keystore.properties");
const RELEASE_GRADLE_APPLY = "apply from: 'icl-release.gradle'";
const APP_LINK_START = "<!-- ICL_APP_LINK_START -->";
const APP_LINK_END = "<!-- ICL_APP_LINK_END -->";
const IOS_PBXPROJ = path.resolve("ios/App/App.xcodeproj/project.pbxproj");
const IOS_ENTITLEMENTS = path.resolve("ios/App/App/App.entitlements");
const NL = String.fromCharCode(10);
const INDENT = String.fromCharCode(9).repeat(4);
const IOS_ENTITLEMENTS_SETTING = "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;";
const NATIVE_TARGET = String(process.env.VITE_APP_ENV || "production").trim().toLowerCase();
const IOS_DEV_NETWORK_START = "<!-- ICL_DEV_LOCAL_NETWORK_START -->";
const IOS_DEV_NETWORK_END = "<!-- ICL_DEV_LOCAL_NETWORK_END -->";

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function configureIosAppDelegate() {
  let source = await readOptional(IOS_APP_DELEGATE);
  if (!source) return;

  const methods = [];
  if (!source.includes("capacitorDidRegisterForRemoteNotifications")) {
    methods.push(`
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
`);
  }
  if (!source.includes("capacitorDidFailToRegisterForRemoteNotifications")) {
    methods.push(`
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`);
  }
  if (!source.includes('Notification.Name.init("didReceiveRemoteNotification")')) {
    methods.push(`
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
`);
  }

  if (methods.length === 0) return;
  const closingBrace = source.lastIndexOf("}");
  if (closingBrace < 0) throw new Error("AppDelegate.swift 구조를 확인할 수 없습니다.");
  source = `${source.slice(0, closingBrace)}${methods.join("")}\n}\n`;
  await fs.writeFile(IOS_APP_DELEGATE, source, "utf8");
  console.log("[capacitor] iOS Firebase Messaging delegate 설정 완료");
}

async function configureIosUrlScheme() {
  let source = await readOptional(IOS_INFO_PLIST);
  if (!source || source.includes("<string>iclpilates</string>")) return;

  const block = `
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleTypeRole</key>
\t\t\t<string>Editor</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>iclpilates</string>
\t\t\t</array>
\t\t</dict>
\t</array>`;
  const rootDictEnd = source.lastIndexOf("</dict>");
  if (rootDictEnd < 0) throw new Error("Info.plist root dictionary was not found.");
  source = `${source.slice(0, rootDictEnd)}${block}\n${source.slice(rootDictEnd)}`;
  await fs.writeFile(IOS_INFO_PLIST, source, "utf8");
  console.log("[capacitor] iOS iclpilates 딥링크 설정 완료");
}

async function configureAndroidManifest() {
  let source = await readOptional(ANDROID_MANIFEST);
  if (!source) return;

  if (!source.includes('android:scheme="iclpilates"')) {
    const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="iclpilates" />
            </intent-filter>
`;
    const launcherEnd = source.indexOf("</intent-filter>");
    if (launcherEnd < 0) throw new Error("AndroidManifest.xml의 launcher intent-filter를 확인할 수 없습니다.");
    const insertAt = launcherEnd + "</intent-filter>".length;
    source = `${source.slice(0, insertAt)}${filter}${source.slice(insertAt)}`;
  }

  if (!source.includes("com.google.firebase.messaging.default_notification_icon")) {
    const metadata = `
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_icl" />
`;
    source = source.replace("</application>", `${metadata}    </application>`);
  }

  await fs.writeFile(ANDROID_MANIFEST, source, "utf8");
  console.log("[capacitor] Android 딥링크와 푸시 아이콘 설정 완료");
}

async function writeAndroidNotificationIcon() {
  const icon = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,2a7,7 0,0 0,-7,7v3.6L3.3,15a1,1 0,0 0,0.8 1.6h15.8a1,1 0,0 0,0.8 -1.6L19,12.6V9a7,7 0,0 0,-7 -7zM9.6,18a2.5,2.5 0,0 0,4.8 0z" />
</vector>
`;
  await fs.mkdir(path.dirname(ANDROID_NOTIFICATION_ICON), { recursive: true });
  await fs.writeFile(ANDROID_NOTIFICATION_ICON, icon, "utf8");
}

async function configureNativeNetworkPolicy() {
  let androidManifest = await readOptional(ANDROID_MANIFEST);
  if (androidManifest) {
    androidManifest = androidManifest.replace(
      /\s+android:usesCleartextTraffic="(?:true|false)"/g,
      "",
    );
    if (NATIVE_TARGET === "development") {
      androidManifest = androidManifest.replace(
        "<application",
        '<application\n        android:usesCleartextTraffic="true"',
      );
    }
    await fs.writeFile(ANDROID_MANIFEST, androidManifest, "utf8");
  }

  let infoPlist = await readOptional(IOS_INFO_PLIST);
  if (infoPlist) {
    const devNetworkPattern = new RegExp(
      `${IOS_DEV_NETWORK_START}[\\s\\S]*?${IOS_DEV_NETWORK_END}\\s*`,
      "g",
    );
    infoPlist = infoPlist.replace(devNetworkPattern, "");

    if (NATIVE_TARGET === "development") {
      const block = `${IOS_DEV_NETWORK_START}
\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsLocalNetworking</key>
\t\t<true/>
\t</dict>
\t${IOS_DEV_NETWORK_END}`;
      const rootDictEnd = infoPlist.lastIndexOf("</dict>");
      if (rootDictEnd < 0) throw new Error("Info.plist root dictionary was not found.");
      infoPlist = `${infoPlist.slice(0, rootDictEnd)}${block}\n${infoPlist.slice(rootDictEnd)}`;
    }

    await fs.writeFile(IOS_INFO_PLIST, infoPlist, "utf8");
  }

  console.log(`[capacitor] ${NATIVE_TARGET} network policy applied`);
}

async function configureAndroidGradleProperties() {
  let source = await readOptional(ANDROID_GRADLE_PROPERTIES);
  if (!source || source.includes("android.overridePathCheck")) return;

  // Windows에서 프로젝트 경로에 한글이 있으면 AGP가 빌드를 차단하므로
  // AGP가 안내하는 공식 override로 검사만 해제합니다.
  source = `${source.trimEnd()}\n\nandroid.overridePathCheck=true\n`;
  await fs.writeFile(ANDROID_GRADLE_PROPERTIES, source, "utf8");
  console.log("[capacitor] Android non-ASCII 경로 검사 override 설정 완료");
}

async function reportFirebaseFiles() {
  const required = [
    "android/app/google-services.json",
    "ios/App/App/GoogleService-Info.plist",
  ];
  const missing = [];
  for (const file of required) {
    try {
      await fs.access(path.resolve(file));
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    console.warn(`[capacitor] 실기기 푸시 전 Firebase 설정 파일을 추가해 주세요:\n- ${missing.join("\n- ")}`);
  }
}


/*
 * android/ 는 .gitignore된 생성물이라 재생성하면 손으로 넣은 서명 설정과 versionCode 가 사라집니다.
 * 그래서 버전은 추적되는 app-version.json, 서명은 저장소 밖 keystore.properties 를 원본으로 두고
 * sync 할 때마다 android/app/icl-release.gradle 로 다시 주입합니다.
 */
async function configureAndroidRelease() {
  const appGradle = await readOptional(ANDROID_APP_GRADLE);
  if (!appGradle) return;

  let version;
  try {
    version = JSON.parse(await fs.readFile(APP_VERSION_FILE, "utf8"));
  } catch {
    throw new Error("app-version.json 을 읽을 수 없습니다. 네이티브 앱 버전의 단일 소스입니다.");
  }
  const versionCode = Number(version.versionCode);
  const versionName = String(version.versionName || "").trim();
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("app-version.json 의 versionCode 는 1 이상의 정수여야 합니다.");
  }
  if (!/^\d+\.\d+(\.\d+)?$/.test(versionName)) {
    throw new Error("app-version.json 의 versionName 형식을 확인해 주세요. 예: 1.0.0");
  }

  const hasKeystore = await fs
    .access(KEYSTORE_PROPERTIES)
    .then(() => true)
    .catch(() => false);

  // keystore.properties 가 없으면 서명 설정을 아예 만들지 않습니다.
  // 잘못된 키로 서명되는 것보다 미서명으로 남아 검사에서 걸리는 편이 안전합니다.
  const signingBlock = hasKeystore
    ? `
def iclKeystoreFile = file("${KEYSTORE_PROPERTIES.split(path.sep).join("/")}")
def iclKeystore = new Properties()
iclKeystore.load(new FileInputStream(iclKeystoreFile))

android {
    signingConfigs {
        release {
            storeFile file(iclKeystore['storeFile'])
            storePassword iclKeystore['storePassword']
            keyAlias iclKeystore['keyAlias']
            keyPassword iclKeystore['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`
    : `
// keystore.properties 가 없어 릴리스 서명 설정을 적용하지 않았습니다.
// frontend/keystore.properties.example 을 참고해 설정한 뒤 다시 sync 하세요.
`;

  const generated = `// 이 파일은 scripts/configure-native.mjs 가 생성합니다. 직접 수정하지 마세요.
// 버전 원본: frontend/app-version.json
// 서명 원본: frontend/keystore.properties (커밋 금지)

android {
    defaultConfig {
        versionCode ${versionCode}
        versionName "${versionName}"
    }
}
${signingBlock}`;
  await fs.writeFile(ANDROID_RELEASE_GRADLE, generated, "utf8");

  // 순정 build.gradle 로 재생성되어도 위 파일이 반드시 적용되도록 한 줄을 보장합니다.
  if (!appGradle.includes(RELEASE_GRADLE_APPLY)) {
    await fs.writeFile(
      ANDROID_APP_GRADLE,
      `${appGradle.trimEnd()}

${RELEASE_GRADLE_APPLY}
`,
      "utf8",
    );
  }

  console.log(
    `[capacitor] Android 릴리스 설정 적용 (versionName ${versionName}, versionCode ${versionCode}, 서명 ${hasKeystore ? "설정됨" : "미설정"})`,
  );
}

/*
 * R8(minifyEnabled)은 현재 꺼져 있습니다. Capacitor 는 플러그인을 리플렉션으로 찾기 때문에
 * keep 규칙 없이 켜면 실기기에서만 터집니다. 규칙은 미리 넣어 두고, 실기기 검증이 가능해지면
 * android/app/icl-release.gradle 이 아니라 문서 절차에 따라 minifyEnabled 를 켭니다.
 */
async function configureAndroidProguardRules() {
  const source = await readOptional(ANDROID_PROGUARD_RULES);
  const marker = "# ICL_CAPACITOR_KEEP_RULES";
  if (source.includes(marker)) return;

  const rules = `${marker}
# Capacitor 는 capacitor.plugins.json 을 읽어 플러그인 클래스를 리플렉션으로 로드합니다.
# R8 을 켜면 아래 규칙이 없을 때 플러그인이 통째로 제거되어 실기기에서만 실패합니다.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
`;
  await fs.writeFile(ANDROID_PROGUARD_RULES, `${source.trimEnd()}

${rules}`, "utf8");
  console.log("[capacitor] Android R8 keep 규칙 준비 완료 (minifyEnabled 는 여전히 off)");
}


/*
 * Android App Link: https 링크를 눌렀을 때 브라우저 대신 앱이 열리게 합니다.
 * 개발 빌드가 운영 도메인을 가로채면 실기기에서 웹 확인이 막히므로 production 에서만 넣습니다.
 * 실제 동작하려면 각 host 의 /.well-known/assetlinks.json 이 릴리스 서명 지문과 함께 배포돼야 합니다.
 * (npm run assetlinks)
 */
async function configureAndroidAppLinks() {
  let source = await readOptional(ANDROID_MANIFEST);
  if (!source) return;

  const existing = new RegExp("[\\s]*" + APP_LINK_START + "[\\s\\S]*?" + APP_LINK_END, "g");
  source = source.replace(existing, "");

  const hosts = String(process.env.VITE_APP_LINK_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if (NATIVE_TARGET === "production" && hosts.length > 0) {
    const hostTags = hosts
      .map((host) => `                <data android:scheme="https" android:host="${host}" />`)
      .join("\n");
    const block = `
            ${APP_LINK_START}
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
${hostTags}
            </intent-filter>
            ${APP_LINK_END}
`;
    const anchor = '<data android:scheme="iclpilates" />';
    const at = source.indexOf(anchor);
    if (at < 0) throw new Error("AndroidManifest.xml 의 커스텀 scheme intent-filter 를 찾을 수 없습니다.");
    const closeAt = source.indexOf("</intent-filter>", at);
    const insertAt = closeAt + "</intent-filter>".length;
    source = source.slice(0, insertAt) + block + source.slice(insertAt);
    console.log(`[capacitor] Android App Link 설정 완료 (${hosts.join(", ")})`);
  } else {
    console.log("[capacitor] Android App Link 미적용 (production 빌드에서만 적용)");
  }

  await fs.writeFile(ANDROID_MANIFEST, source, "utf8");
}


/*
 * iOS 도 android 와 마찬가지로 ios/ 폴더가 .gitignore된 생성물입니다.
 * 재생성해도 버전과 Universal Link 설정이 남아 있도록 여기서 다시 주입합니다.
 *
 * Universal Link 는 https 링크를 눌렀을 때 사파리 대신 앱이 열리게 하는 기능입니다.
 * 실제로 동작하려면 세 가지가 모두 필요합니다.
 *   1) 앱에 associated-domains 권한(entitlements)   <- 이 함수가 처리
 *   2) Xcode 프로젝트가 그 entitlements 를 쓰도록 설정  <- 이 함수가 처리
 *   3) 도메인에 apple-app-site-association 파일 배포   <- npm run aasa
 *
 * 개발 빌드에는 넣지 않습니다. 개발 빌드가 운영 도메인을 가로채면
 * 실기기에서 웹 확인이 막히기 때문입니다.
 */
async function configureIosUniversalLinks() {
  let pbxproj = await readOptional(IOS_PBXPROJ);
  if (!pbxproj) return;

  const hosts = String(process.env.VITE_APP_LINK_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const enabled = NATIVE_TARGET === "production" && hosts.length > 0;

  if (enabled) {
    const domains = hosts
      .map((host) => "		<string>applinks:" + host + "</string>")
      .join(NL);
    const plist = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "	<key>com.apple.developer.associated-domains</key>",
      "	<array>",
      domains,
      "	</array>",
      "</dict>",
      "</plist>",
      "",
    ].join(NL);
    await fs.mkdir(path.dirname(IOS_ENTITLEMENTS), { recursive: true });
    await fs.writeFile(IOS_ENTITLEMENTS, plist, "utf8");

    // Xcode 가 이 파일을 쓰도록 빌드 설정에 한 줄을 넣습니다.
    if (!pbxproj.includes(IOS_ENTITLEMENTS_SETTING)) {
      pbxproj = pbxproj.split("INFOPLIST_FILE = App/Info.plist;").join(
        IOS_ENTITLEMENTS_SETTING + NL + INDENT + "INFOPLIST_FILE = App/Info.plist;",
      );
    }
    console.log("[capacitor] iOS Universal Link 설정 완료 (" + hosts.join(", ") + ")");
  } else {
    await fs.rm(IOS_ENTITLEMENTS, { force: true });
    pbxproj = pbxproj
      .split(IOS_ENTITLEMENTS_SETTING + NL + INDENT)
      .join("")
      .split(IOS_ENTITLEMENTS_SETTING)
      .join("");
    console.log("[capacitor] iOS Universal Link 미적용 (운영 빌드에서만 적용)");
  }

  await fs.writeFile(IOS_PBXPROJ, pbxproj, "utf8");
}

/*
 * iOS 앱 버전도 추적되는 app-version.json 을 원본으로 삼습니다.
 * MARKETING_VERSION 이 사용자에게 보이는 버전, CURRENT_PROJECT_VERSION 이 빌드 번호입니다.
 */
async function configureIosVersion() {
  let pbxproj = await readOptional(IOS_PBXPROJ);
  if (!pbxproj) return;

  const version = JSON.parse(await fs.readFile(APP_VERSION_FILE, "utf8"));
  const versionName = String(version.versionName || "").trim();
  const versionCode = Number(version.versionCode);

  pbxproj = pbxproj
    .replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = " + versionName + ";")
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + versionCode + ";");

  await fs.writeFile(IOS_PBXPROJ, pbxproj, "utf8");
  console.log("[capacitor] iOS 버전 적용 (" + versionName + " / 빌드 " + versionCode + ")");
}

await configureIosAppDelegate();
await configureIosUrlScheme();
await configureNativeNetworkPolicy();
await configureAndroidManifest();
await writeAndroidNotificationIcon();
await configureAndroidGradleProperties();
await configureIosUniversalLinks();
await configureIosVersion();
await configureAndroidAppLinks();
await configureAndroidRelease();
await configureAndroidProguardRules();
await reportFirebaseFiles();
