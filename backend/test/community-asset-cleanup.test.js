// 파일 역할: 글 삭제 시 타인의 업로드 파일이 지워지던 문제(S-3) 수정의 회귀 테스트입니다.
//
// 업로드 파일에는 올린 사람 정보가 없어서, 글에 적힌 경로만 보고 지우면
// 남의 이미지 경로를 자기 글에 적어 넣는 것만으로 타인 파일을 삭제할 수 있었습니다.
// 이제는 같은 경로를 쓰는 다른 글이 남아 있으면 파일을 그대로 둡니다.
import test from "node:test";
import assert from "node:assert/strict";

import { cleanupCommunityAssets } from "../src/features/community/community.service.js";

// 참조 검사와 파일 삭제를 가짜 구현으로 바꿔 실제 DB·디스크 없이 규칙만 확인합니다.
function makeDeps({ referenced = [] } = {}) {
  const deleted = [];
  return {
    deleted,
    deps: {
      isReferenced: async (path) => referenced.includes(path),
      deleteFile: async (path) => { deleted.push(path); },
    },
  };
}

const VICTIM = "/uploads/community/images/victim-photo.jpg";
const MINE = "/uploads/community/images/my-photo.jpg";

test("공격: 남의 파일 경로가 다른 글에서 쓰이고 있으면 지우지 않는다", async () => {
  // 피해자 글이 아직 그 이미지를 쓰고 있는 상황
  const { deleted, deps } = makeDeps({ referenced: [VICTIM] });

  const removed = await cleanupCommunityAssets([VICTIM], deps);

  assert.deepEqual(deleted, [], "타인의 파일이 삭제되면 안 됩니다.");
  assert.deepEqual(removed, []);
});

test("공격: 내 글과 피해자 글이 같은 경로를 쓸 때도 파일이 남는다", async () => {
  // 공격자가 자기 글을 지워도 피해자 글이 남아 있으므로 참조가 유지된다
  const { deleted, deps } = makeDeps({ referenced: [VICTIM] });

  await cleanupCommunityAssets([VICTIM, MINE], deps);

  assert.ok(!deleted.includes(VICTIM), "피해자 파일은 남아야 합니다.");
  assert.ok(deleted.includes(MINE), "참조가 사라진 내 파일은 정리됩니다.");
});

test("정상: 아무도 쓰지 않는 내 파일은 정리된다", async () => {
  const { deleted, deps } = makeDeps({ referenced: [] });

  const removed = await cleanupCommunityAssets([MINE], deps);

  assert.deepEqual(deleted, [MINE], "정상 삭제가 막히면 안 됩니다.");
  assert.deepEqual(removed, [MINE]);
});

test("정상: 여러 파일이 달린 글을 지우면 모두 정리된다", async () => {
  const paths = [MINE, "/uploads/community/videos/my-clip.mp4"];
  const { deleted, deps } = makeDeps({ referenced: [] });

  await cleanupCommunityAssets(paths, deps);

  assert.deepEqual(deleted.sort(), paths.slice().sort());
});

test("참조 확인에 실패하면 파일을 남긴다", async () => {
  const deleted = [];
  const deps = {
    isReferenced: async () => { throw new Error("DB 오류"); },
    deleteFile: async (p) => { deleted.push(p); },
  };

  // 기본 구현은 오류를 잡아 "참조 중"으로 처리하지만,
  // 여기서는 주입한 구현이 그대로 던지므로 호출 자체가 실패해야 한다.
  await assert.rejects(() => cleanupCommunityAssets([MINE], deps));
  assert.deepEqual(deleted, [], "확인이 안 되면 지우지 않습니다.");
});

test("빈 목록은 아무 것도 하지 않는다", async () => {
  const { deleted, deps } = makeDeps();

  assert.deepEqual(await cleanupCommunityAssets([], deps), []);
  assert.deepEqual(await cleanupCommunityAssets(undefined, deps), []);
  assert.deepEqual(deleted, []);
});
