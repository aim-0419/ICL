// Capacitor 프로젝트를 다시 동기화해도 푸시, 딥링크, 알림 아이콘 설정을 동일하게 복원합니다.
import fs from "node:fs/promises";
import path from "node:path";

const IOS_APP_DELEGATE = path.resolve("ios/App/App/AppDelegate.swift");
const IOS_INFO_PLIST = path.resolve("ios/App/App/Info.plist");
const ANDROID_MANIFEST = path.resolve("android/app/src/main/AndroidManifest.xml");
const ANDROID_NOTIFICATION_ICON = path.resolve("android/app/src/main/res/drawable/ic_stat_icl.xml");
const ANDROID_GRADLE_PROPERTIES = path.resolve("android/gradle.properties");

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

await configureIosAppDelegate();
await configureIosUrlScheme();
await configureAndroidManifest();
await writeAndroidNotificationIcon();
await configureAndroidGradleProperties();
await reportFirebaseFiles();
