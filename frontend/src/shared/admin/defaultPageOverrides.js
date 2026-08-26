/**
 * [페이지 기본 이미지 목록]
 *
 * 관리자가 홈페이지 사진을 아직 바꾸지 않았을 때 대신 보여 줄
 * 기본 사진들의 위치를 적어 둔 파일입니다.
 *
 * 예전에 저장된 사진 주소가 지금 서버에 없더라도 화면이 깨지지 않도록
 * 기본 사진으로 바꿔 주는 역할도 합니다.
 */
import { resolveApiAssetUrl } from "../api/client.js";

const ADMIN_DEFAULT_ASSET_ROOT = "/assets/admin-defaults";

// 예전 DB 값이 업로드 경로를 가리켜도 배포 서버에 기본 이미지가 없어서 깨지지 않도록
// 페이지 편집기에서 사용하는 기본 이미지 경로로 보정합니다.
export const DEFAULT_PAGE_IMAGE_OVERRIDES = {
  "/ikleulrim/intro::director-photo": `${ADMIN_DEFAULT_ASSET_ROOT}/intro/director-photo.webp`,

  "/ikleulrim/equipment::equipment-image-equipment-slot-1": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-01.webp`,
  "/ikleulrim/equipment::equipment-image-equipment-slot-2": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-02.webp`,
  "/ikleulrim/equipment::equipment-image-equipment-slot-3": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-03.webp`,
  "/ikleulrim/equipment::equipment-image-equipment-slot-4": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-04.webp`,
  "/ikleulrim/equipment::equipment-image-1782196291464": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-05.webp`,
  "/ikleulrim/equipment::equipment-image-1782196292616": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-06.webp`,
  "/ikleulrim/equipment::equipment-image-1782196293020": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-07.webp`,
  "/ikleulrim/equipment::equipment-image-1782196293174": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-08.webp`,
  "/ikleulrim/equipment::equipment-image-1782196293582": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-09.webp`,
  "/ikleulrim/equipment::equipment-image-1782196295244": `${ADMIN_DEFAULT_ASSET_ROOT}/equipment/equipment-10.webp`,

  "/ikleulrim/instructors::staff-image-1": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-01.webp`,
  "/ikleulrim/instructors::staff-image-2": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-02.webp`,
  "/ikleulrim/instructors::staff-image-3": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-03.webp`,
  "/ikleulrim/instructors::staff-image-4": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-04.webp`,
  "/ikleulrim/instructors::staff-image-5": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-05.webp`,
  "/ikleulrim/instructors::staff-image-6": `${ADMIN_DEFAULT_ASSET_ROOT}/instructors/instructor-06.webp`,
};

const LEGACY_UPLOAD_ASSET_MAP = {
  "/uploads/community/images/1782204697277-d8fb1cfd-e2d3-430e-83f6-89c9ce2ed6dc.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/intro::director-photo"],

  "/uploads/community/images/1782198899851-b49798aa-3a76-4028-bc10-0f1259e39226.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-equipment-slot-1"],
  "/uploads/community/images/1782198914587-9d57e4c9-11b9-42a2-875a-6b7f035e7a7f.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-equipment-slot-2"],
  "/uploads/community/images/1782198939788-24a43d56-ebdd-4cb6-bb92-88792350f5ae.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-equipment-slot-3"],
  "/uploads/community/images/1782198953758-4a95f9ec-ebbb-465d-95c1-9ab13df425ba.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-equipment-slot-4"],
  "/uploads/community/images/1782198966752-ef6ac320-dd90-44fc-ae1f-f5054817fa4d.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196291464"],
  "/uploads/community/images/1782198973700-6df3d70e-8505-4590-ae7a-fc1ea6f88108.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196292616"],
  "/uploads/community/images/1782198978996-e9c03a55-1817-4500-8abf-948e4e6b02a5.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196293020"],
  "/uploads/community/images/1782198984778-949b6b8a-f6dd-43dc-a49c-4a96b19394b5.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196293174"],
  "/uploads/community/images/1782198990262-7dcabdd2-890b-4b2d-b3eb-40696b52b89e.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196293582"],
  "/uploads/community/images/1782198993985-b6a95d4e-5b02-4de1-a3a2-6e57c81d9f6e.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/equipment::equipment-image-1782196295244"],

  "/uploads/community/images/1782088018520-7bd7b532-8790-45b4-bb75-adffd347697c.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-1"],
  "/uploads/community/images/1782088657252-ab64b2f7-b24c-4062-a4f8-99238b92a8c7.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-2"],
  "/uploads/community/images/1782088694210-c73bef2c-6bef-4675-8891-88f7ba02f8ed.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-3"],
  "/uploads/community/images/1782088706730-b7ebd1ea-4ad6-4be9-b44c-c347aaf8f259.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-4"],
  "/uploads/community/images/1782088718912-9f8c828f-53d5-4cf7-856b-16cf7de7600c.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-5"],
  "/uploads/community/images/1782088730124-3015875c-5f99-459e-8bbb-486489958463.jpg": DEFAULT_PAGE_IMAGE_OVERRIDES["/ikleulrim/instructors::staff-image-6"],
};

// 기본 이미지는 webp로 교체했습니다. DB에 예전 jpg/png 경로가 저장돼 있어도
// 화면이 깨지지 않도록 기본 이미지 폴더에 한해 확장자를 webp로 보정합니다.
function upgradeDefaultAssetExtension(value) {
  if (!value.startsWith(`${ADMIN_DEFAULT_ASSET_ROOT}/`)) return value;
  return value.replace(/\.(jpe?g|png)$/i, ".webp");
}

export function normalizePageOverrideAsset(value) {
  if (typeof value !== "string") return value;
  return resolveApiAssetUrl(upgradeDefaultAssetExtension(LEGACY_UPLOAD_ASSET_MAP[value] || value));
}
