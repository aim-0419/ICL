// Capacitor iOS 프로젝트를 다시 생성해도 푸시 토큰 전달 코드가 빠지지 않도록 보정합니다.
import fs from "node:fs/promises";
import path from "node:path";

const appDelegatePath = path.resolve("ios/App/App/AppDelegate.swift");

async function configureIosPushDelegate() {
  let source;
  try {
    source = await fs.readFile(appDelegatePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (source.includes("capacitorDidRegisterForRemoteNotifications")) return;

  const methods = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
  const closingBrace = source.lastIndexOf("}");
  if (closingBrace < 0) throw new Error("AppDelegate.swift 구조를 확인할 수 없습니다.");
  await fs.writeFile(appDelegatePath, `${source.slice(0, closingBrace)}${methods}\n}\n`, "utf8");
  console.log("[capacitor] iOS 푸시 등록 delegate 설정 완료");
}

await configureIosPushDelegate();
