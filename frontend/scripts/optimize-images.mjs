// 파일 역할: public 이미지의 과대 원본을 리사이즈/WebP 변환해 앱·웹 용량을 줄입니다.
//
// 원본은 손대기 전에 _original-assets/ 로 백업합니다(gitignore). 변환 방식은 두 가지입니다.
//  - resize-jpeg : 파일명·확장자를 그대로 두고 JPEG 로 리사이즈합니다. admin-default 이미지처럼
//                  DB/localStorage 에 경로가 저장돼 있을 수 있는 자산에 씁니다(참조가 깨지지 않음).
//  - to-webp     : WebP 로 변환하고 새 파일을 만듭니다. 참조가 코드 1곳뿐인 자산에 씁니다.
//                  이 경우 호출측이 코드 참조 경로를 함께 갱신해야 합니다.
//
// 재사용: 아래 MANIFEST 만 고쳐서 다시 실행하면 됩니다.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PUBLIC = path.resolve("public");
const BACKUP = path.resolve("_original-assets");

// [src(=public 기준 상대경로), mode, maxWidth, quality, dest(to-webp일 때 새 상대경로)]
const MANIFEST = [
  // admin-default: 확장자 유지, in-place 리사이즈
  ["assets/admin-defaults/instructors/instructor-01.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/instructors/instructor-02.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/instructors/instructor-03.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/instructors/instructor-04.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/instructors/instructor-05.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/instructors/instructor-06.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/intro/director-photo.jpg", "resize-jpeg", 1200, 80],
  ["assets/admin-defaults/equipment/equipment-05.jpg", "resize-jpeg", 1200, 80],
  // 비 admin-default: WebP 변환(+ 참조 코드 갱신은 별도)
  ["assets/images/home/certificate-template-a4.png", "to-webp", 1200, 85, "assets/images/home/certificate-template-a4.webp"],
  ["assets/images/intro/intro-main.png", "to-webp", 1600, 82, "assets/images/intro/intro-main.webp"],
  ["assets/images/home/main-hero/이끌림 필라테스 메인 페이지 상단 이미지.png", "to-webp", 1600, 82, "assets/images/home/main-hero/home-hero-main.webp"],
];

function mb(n){ return (n/1048576).toFixed(2)+"MB"; }
function backup(rel){
  const src = path.join(PUBLIC, rel);
  const dst = path.join(BACKUP, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
}

const rows = [];
for (const [rel, mode, maxWidth, quality, dest] of MANIFEST) {
  const src = path.join(PUBLIC, rel);
  if (!fs.existsSync(src)) { console.log("건너뜀(없음):", rel); continue; }
  backup(rel);
  const before = fs.statSync(src).size;
  const input = fs.readFileSync(src); // 경로 핸들 잠금 회피(Windows in-place 쓰기)
  const meta = await sharp(input).metadata();
  const resize = meta.width > maxWidth ? { width: maxWidth } : {};

  let outPath, after, outRel;
  if (mode === "resize-jpeg") {
    const buf = await sharp(input).resize(resize).jpeg({ quality, mozjpeg: true }).toBuffer();
    fs.writeFileSync(src, buf);
    outPath = src; outRel = rel; after = buf.length;
  } else {
    outRel = dest;
    outPath = path.join(PUBLIC, dest);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const buf = await sharp(input).resize(resize).webp({ quality }).toBuffer();
    fs.writeFileSync(outPath, buf);
    after = buf.length;
    // 원본 png 는 백업했으므로 삭제(용량 목적). WebP 새 파일이 대체.
    fs.unlinkSync(src);
  }
  rows.push({ rel, mode, dim: `${meta.width}x${meta.height}→${resize.width||meta.width}px`, before, after, outRel });
  console.log(`${mode.padEnd(11)} ${rel}\n    ${mb(before)} → ${mb(after)}  (${outRel})`);
}

const tb = rows.reduce((s,r)=>s+r.before,0), ta = rows.reduce((s,r)=>s+r.after,0);
console.log(`\n합계: ${mb(tb)} → ${mb(ta)}  (감량 ${mb(tb-ta)})`);
