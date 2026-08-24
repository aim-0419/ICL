// Capacitor 프로젝트를 다시 동기화해도 푸시, 딥링크, 알림 아이콘 설정을 동일하게 복원합니다.
import fs from "node:fs/promises";
import path from "node:path";

const IOS_APP_DELEGATE = path.resolve("ios/App/App/AppDelegate.swift");
const IOS_INFO_PLIST = path.resolve("ios/App/App/Info.plist");
const ANDROID_MANIFEST = path.resolve("android/app/src/main/AndroidManifest.xml");
const ANDROID_NOTIFICATION_ICON = path.resolve("android/app/src/main/res/drawable/ic_stat_icl.xml");
const ANDROID_GRADLE_PROPERTIES = path.resolve("android/gradle.properties");
const ANDROID_APP_GRADLE = path.resolve("android/app/build.gradle");
const APP_VERSION_FILE = path.resolve("app-version.json");
const ANDROID_STRINGS = path.resolve("android/app/src/main/res/values/strings.xml");
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

  // 백업 비활성화. 이 앱의 WebView 저장소에는 세션 쿠키가 남는데,
  // 자동 백업이 이를 기기 밖(Google 백업)으로 복사하면 세션 탈취 표면이 생깁니다.
  // 개인정보·결제·예약을 다루는 앱이므로 백업으로 얻는 편의보다 위험이 큽니다.
  source = source.replace('android:allowBackup="true"', 'android:allowBackup="false"');

  await fs.writeFile(ANDROID_MANIFEST, source, "utf8");
  console.log("[capacitor] Android 딥링크와 푸시 아이콘 설정 완료 (allowBackup=false)");

  // 커스텀 스킴 표기 통일. 실제 동작하는 스킴은 Android intent-filter,
  // iOS CFBundleURLSchemes, JS 딥링크 처리(runtime.js) 모두 iclpilates 입니다.
  // strings.xml 의 custom_url_scheme 은 Capacitor 8 템플릿 잔재로 참조하는 코드가
  // 없지만, 값이 어긋난 채 남아 있으면 혼동을 부르므로 같은 값으로 맞춥니다.
  let strings = await readOptional(ANDROID_STRINGS);
  if (strings && strings.includes("<string name=\"custom_url_scheme\">com.iclpilates.app</string>")) {
    strings = strings.replace(
      "<string name=\"custom_url_scheme\">com.iclpilates.app</string>",
      "<string name=\"custom_url_scheme\">iclpilates</string>",
    );
    await fs.writeFile(ANDROID_STRINGS, strings, "utf8");
    console.log("[capacitor] custom_url_scheme 을 iclpilates 로 통일");
  }
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

// 함수 역할: android/app/build.gradle 의 versionCode / versionName 을 주입합니다.
//
// android/ 폴더는 .gitignore 대상이라 재생성될 때마다 템플릿 기본값(1 / "1.0")으로
// 돌아갑니다. 버전의 원본을 Git에 추적되는 app-version.json 하나로 두고 sync 때마다
// 다시 주입해, 어느 컴퓨터에서 빌드해도 같은 버전이 나오게 합니다.
//
// 값이 없거나 형식이 틀리면 여기서 던져서 sync 전체가 실패합니다.
// 조용히 1로 떨어져 Play 업로드에서 "versionCode 중복"으로 뒤늦게 발견되는 것보다
// 빌드 단계에서 시끄럽게 실패하는 쪽이 낫습니다.
// 환경변수 APP_VERSION_CODE / APP_VERSION_NAME 이 있으면 파일보다 우선합니다(CI 대비).
async function configureAndroidAppVersion() {
  let raw;
  try {
    raw = await fs.readFile(APP_VERSION_FILE, "utf8");
  } catch {
    throw new Error("[capacitor] app-version.json 이 없습니다. frontend/app-version.json 에 versionCode/versionName 을 정의하세요.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("[capacitor] app-version.json 을 JSON 으로 읽을 수 없습니다.");
  }

  const versionCode = Number(process.env.APP_VERSION_CODE ?? parsed.versionCode);
  const versionName = String(process.env.APP_VERSION_NAME ?? parsed.versionName ?? "").trim();

  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("[capacitor] versionCode 는 1 이상의 정수여야 합니다.");
  }
  if (!/^[0-9]+(\.[0-9]+)*$/.test(versionName)) {
    throw new Error("[capacitor] versionName 은 1.0 같은 숫자.점 형식이어야 합니다.");
  }

  let source = await readOptional(ANDROID_APP_GRADLE);
  if (!source) return;

  const next = source
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]*"/, `versionName "${versionName}"`);
  if (!/versionCode \d+/.test(source) || !/versionName "/.test(source)) {
    throw new Error("[capacitor] build.gradle 에서 versionCode/versionName 을 찾지 못했습니다.");
  }

  await fs.writeFile(ANDROID_APP_GRADLE, next, "utf8");
  console.log(`[capacitor] Android versionCode ${versionCode} / versionName ${versionName} 주입 완료`);
}

async function configureAndroidReleaseSigning() {
  let source = await readOptional(ANDROID_APP_GRADLE);
  if (!source || source.includes("signingConfigs")) return;

  // Play는 서명된 AAB만 받습니다. 다만 키스토어는 저장소에 두면 안 되므로
  // android/keystore.properties 가 있을 때만 서명 설정이 켜지게 합니다.
  // 파일이 없으면 debug 빌드는 그대로 되고 release는 미서명으로 남아,
  // 잘못된 키로 서명되는 사고 대신 눈에 띄는 실패로 이어집니다.
  const anchor = `    buildTypes {
        release {`;
  if (!source.includes(anchor)) return;

  const signing = `    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }`;

  source = source.replace(anchor, signing);
  await fs.writeFile(ANDROID_APP_GRADLE, source, "utf8");
  console.log("[capacitor] Android release 서명 설정 연결 완료 (keystore.properties 존재 시 활성)");
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

await configureIosAppDelegate();
await configureIosUrlScheme();
await configureNativeNetworkPolicy();
await configureAndroidManifest();
await writeAndroidNotificationIcon();
await configureAndroidGradleProperties();
await configureAndroidAppVersion();
await configureAndroidReleaseSigning();
await reportFirebaseFiles();
