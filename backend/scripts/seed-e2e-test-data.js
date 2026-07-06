import mysql from "mysql2/promise";

import { env } from "../src/config/env.js";
import { hashPassword } from "../src/shared/security/password.js";
import { emailHash, encryptedUserValues, encryptPii } from "../src/shared/security/pii.js";

const TARGET_TEST_DB = "homepage_test";
const TARGET_TEST_USER = "homepage_test_user";
const TEST_PASSWORD = String(process.env.E2E_TEST_PASSWORD || "").trim();
const EVENT_PLACEHOLDER_IMAGE = "/uploads/e2e/event-placeholder.png";

const IDS = {
  admin: "e2e_admin",
  member: "e2e_member",
  educationMember: "e2e_education_member",
  studioMember: "e2e_studio_member",
  studioStaff: "e2e_studio_staff",
  noAccessMember: "e2e_no_access_member",
  academyProduct: "e2e_product_academy_intro",
  academyVideo: "e2e_video_academy_intro",
  academyChapter: "e2e_chapter_academy_intro_1",
  academyOrder: "e2e_order_academy_intro",
  academyRefundRequest: "e2e_refund_request_academy_intro",
  academyGrant: "e2e_grant_member_intro",
  academyProgress: "e2e_progress_marker",
  staffInstructor: "e2e_staff_instructor",
  passProduct: "e2e_pass_product_group",
  studioPass: "e2e_pass_studio_member",
  studioClassAvailable: "e2e_class_available",
  studioClassReserved: "e2e_class_reserved",
  studioBooking: "e2e_booking_reserved",
  studioPassIssueTx: "e2e_pass_tx_issue",
  studioPassBookingTx: "e2e_pass_tx_booking",
  studioPassRefund: "e2e_studio_pass_refund",
  studioPolicy: "e2e_policy_default",
  reviewPost: "e2e_review_post",
  event: "e2e_event",
  inquiryPost: "e2e_inquiry_post",
  inquiryReply: "e2e_inquiry_reply",
  consultation: "e2e_consultation",
};

function assertSafeSeedEnv() {
  const errors = [];

  if (env.nodeEnv !== "test") errors.push("NODE_ENV is not test");
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE is not true");
  if (env.dbName !== TARGET_TEST_DB) errors.push("DB_NAME is not the approved test DB");
  if (env.dbUser !== TARGET_TEST_USER) errors.push("DB_USER is not the approved test DB user");
  if (env.allowE2eDataMutation !== true) errors.push("ALLOW_E2E_DATA_MUTATION is not enabled for test DB");
  if (!TEST_PASSWORD) errors.push("E2E_TEST_PASSWORD is not set");
  if (env.allowExternalEmailSend) errors.push("external email send is enabled");
  if (env.allowExternalSmsSend) errors.push("external SMS send is enabled");
  if (env.allowExternalKakaoSend) errors.push("external Kakao send is enabled");
  if (env.allowExternalPushSend) errors.push("external push send is enabled");
  if (env.allowExternalPaymentCalls) errors.push("external payment/refund calls are enabled");
  if (env.academyPublishSchedulerEnabled) errors.push("academy publish scheduler is enabled");
  if (env.notificationSchedulerEnabled) errors.push("notification scheduler is enabled");
  if (!/test|e2e|qa/i.test(String(env.uploadRootPath))) {
    errors.push("UPLOAD_ROOT does not look like a test path");
  }

  if (errors.length > 0) {
    throw new Error(`Unsafe E2E seed environment: ${errors.join("; ")}`);
  }
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function addHours(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function makeEncryptedUser({ name, email, phone = "", birthYear = "" }) {
  return encryptedUserValues({ name, email, phone, birthYear });
}

async function assertConnectedToTestDb(conn) {
  const [rows] = await conn.query("SELECT DATABASE() AS db");
  const databaseName = String(rows?.[0]?.db || "");
  if (databaseName !== TARGET_TEST_DB) {
    throw new Error("Connected database is not the approved test DB");
  }
}

async function assertRequiredTables(conn) {
  const required = [
    "users",
    "products",
    "academy_videos",
    "academy_video_chapters",
    "academy_progress",
    "academy_chapter_progress",
    "orders",
    "refund_requests",
    "video_grants",
    "studio_staff_profiles",
    "studio_pass_products",
    "studio_passes",
    "studio_pass_refunds",
    "studio_pass_transactions",
    "studio_classes",
    "studio_bookings",
    "studio_member_profiles",
    "studio_booking_policies",
    "review_posts",
    "events",
    "inquiry_posts",
    "inquiry_replies",
    "studio_consultations",
  ];
  const [rows] = await conn.query("SHOW TABLES");
  const existing = new Set(
    rows.flatMap((row) => Object.values(row).map((value) => String(value || ""))),
  );
  const missing = required.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`Missing required test tables: ${missing.join(", ")}`);
  }
}

async function upsertUser(conn, user, passwordHash) {
  const pii = makeEncryptedUser(user);
  await conn.execute(
    `INSERT INTO users (
       id, login_id, name, email, email_hash, phone_hash, name_hash, password,
       phone, role, is_admin, user_grade, birth_year_encrypted, points,
       account_status, platform, withdrawn_at, withdrawal_purge_at, restored_at,
       marketing_agree, marketing_agreed_at, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, 0, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       login_id = VALUES(login_id),
       name = VALUES(name),
       email = VALUES(email),
       email_hash = VALUES(email_hash),
       phone_hash = VALUES(phone_hash),
       name_hash = VALUES(name_hash),
       password = VALUES(password),
       phone = VALUES(phone),
       role = VALUES(role),
       is_admin = VALUES(is_admin),
       user_grade = VALUES(user_grade),
       birth_year_encrypted = VALUES(birth_year_encrypted),
       points = VALUES(points),
       account_status = 'active',
       platform = VALUES(platform),
       withdrawn_at = NULL,
       withdrawal_purge_at = NULL,
       restored_at = NULL`,
    [
      user.id,
      user.loginId,
      pii.encryptedName,
      pii.encryptedEmail,
      pii.emailHash,
      pii.phoneHash,
      pii.nameHash,
      passwordHash,
      pii.encryptedPhone,
      user.role,
      user.isAdmin ? 1 : 0,
      user.userGrade,
      pii.encryptedBirthYear,
      Number(user.points || 0),
      user.platform || "education",
    ],
  );
}

async function seedUsers(conn) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const users = [
    {
      id: IDS.admin,
      loginId: "e2e_admin",
      name: "E2E 관리자",
      email: "e2e_admin@example.test",
      phone: "01090000001",
      birthYear: "1980",
      role: "admin",
      isAdmin: true,
      userGrade: "admin0",
      platform: "education",
      points: 10000,
    },
    {
      id: IDS.member,
      loginId: "e2e_member",
      name: "E2E 일반회원",
      email: "e2e_member@example.test",
      phone: "01090000002",
      birthYear: "1991",
      role: "user",
      isAdmin: false,
      userGrade: "member",
      platform: "education",
      points: 1000,
    },
    {
      id: IDS.educationMember,
      loginId: "e2e_education_member",
      name: "E2E 교육회원",
      email: "e2e_education_member@example.test",
      phone: "01090000003",
      birthYear: "1992",
      role: "user",
      isAdmin: false,
      userGrade: "member",
      platform: "education",
      points: 2000,
    },
    {
      id: IDS.studioMember,
      loginId: "e2e_studio_member",
      name: "E2E 스튜디오회원",
      email: "e2e_studio_member@example.test",
      phone: "01090000004",
      birthYear: "1988",
      role: "user",
      isAdmin: false,
      userGrade: "member",
      platform: "studio",
      points: 3000,
    },
    {
      id: IDS.studioStaff,
      loginId: "e2e_studio_staff",
      name: "E2E 스튜디오 스태프",
      email: "e2e_studio_staff@example.test",
      phone: "01090000006",
      birthYear: "1990",
      role: "user",
      isAdmin: false,
      userGrade: "member",
      platform: "studio",
      points: 0,
    },
    {
      id: IDS.noAccessMember,
      loginId: "e2e_no_access_member",
      name: "E2E 권한없음회원",
      email: "e2e_no_access_member@example.test",
      phone: "01090000005",
      birthYear: "1995",
      role: "user",
      isAdmin: false,
      userGrade: "member",
      platform: "education",
      points: 0,
    },
  ];

  for (const user of users) {
    await upsertUser(conn, user, passwordHash);
  }
}

async function seedAcademy(conn) {
  await conn.execute(
    `INSERT INTO products (id, name, price, description, period)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       price = VALUES(price),
       description = VALUES(description),
       period = VALUES(period)`,
    [
      IDS.academyProduct,
      "E2E 교육영상 입문",
      1000,
      "E2E 테스트 전용 교육영상 상품입니다.",
      "90일",
    ],
  );

  await conn.execute(
    `INSERT INTO academy_videos (
       id, product_id, instructor, category, badge, original_price, sale_price,
       rating, reviews, image_path, video_path, publish_at, is_hidden, created_at
     )
     VALUES (?, ?, ?, '입문', 'New', 2000, 1000, 4.8, 1, ?, ?, NOW(), 0, NOW())
     ON DUPLICATE KEY UPDATE
       instructor = VALUES(instructor),
       category = VALUES(category),
       badge = VALUES(badge),
       original_price = VALUES(original_price),
       sale_price = VALUES(sale_price),
       rating = VALUES(rating),
       reviews = VALUES(reviews),
       image_path = VALUES(image_path),
       video_path = VALUES(video_path),
       publish_at = NOW(),
       is_hidden = 0`,
    [
      IDS.academyVideo,
      IDS.academyProduct,
      "E2E Academy",
      EVENT_PLACEHOLDER_IMAGE,
      "/uploads/academy/e2e-video.mp4",
    ],
  );

  await conn.execute(
    `INSERT INTO academy_video_chapters (
       id, video_id, chapter_order, title, description, video_path, duration_sec, is_preview, created_at
     )
     VALUES (?, ?, 1, ?, ?, ?, 600, 1, NOW())
     ON DUPLICATE KEY UPDATE
       chapter_order = VALUES(chapter_order),
       title = VALUES(title),
       description = VALUES(description),
       video_path = VALUES(video_path),
       duration_sec = VALUES(duration_sec),
       is_preview = VALUES(is_preview)`,
    [
      IDS.academyChapter,
      IDS.academyVideo,
      "E2E 1차시",
      "E2E 테스트용 차시입니다.",
      "/uploads/academy/e2e-video.mp4",
    ],
  );

  const educationEmail = "e2e_education_member@example.test";
  const orderPayload = {
    e2e: true,
    paymentStatus: "e2e_mock_paid",
    selectedProductIds: [IDS.academyProduct],
    items: [{ productId: IDS.academyProduct, quantity: 1 }],
    customer: {
      userId: IDS.educationMember,
      ageGroup: "E2E",
    },
  };

  await conn.execute(
    `INSERT INTO orders (id, order_name, amount, customer_email, customer_email_hash, payload, created_at, cancelled_product_ids)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), JSON_ARRAY())
     ON DUPLICATE KEY UPDATE
       order_name = VALUES(order_name),
       amount = VALUES(amount),
       customer_email = VALUES(customer_email),
       customer_email_hash = VALUES(customer_email_hash),
       payload = VALUES(payload),
       cancelled_product_ids = JSON_ARRAY()`,
    [
      IDS.academyOrder,
      "E2E 교육영상 테스트 주문",
      1000,
      encryptPii(educationEmail),
      emailHash(educationEmail),
      JSON.stringify(orderPayload),
    ],
  );

  await conn.execute(
    `INSERT INTO academy_progress (
       user_id, video_id, \`current_time\`, duration, progress_percent, completed, last_watched_at, created_at
     )
     VALUES (?, ?, 120, 600, 20, 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       \`current_time\` = VALUES(\`current_time\`),
       duration = VALUES(duration),
       progress_percent = VALUES(progress_percent),
       completed = VALUES(completed),
       last_watched_at = NOW()`,
    [IDS.educationMember, IDS.academyVideo],
  );

  await conn.execute(
    `INSERT INTO academy_chapter_progress (
       user_id, video_id, chapter_id, \`current_time\`, duration, progress_percent, completed, last_watched_at, created_at
     )
     VALUES (?, ?, ?, 120, 600, 20, 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       \`current_time\` = VALUES(\`current_time\`),
       duration = VALUES(duration),
       progress_percent = VALUES(progress_percent),
       completed = VALUES(completed),
       last_watched_at = NOW()`,
    [IDS.educationMember, IDS.academyVideo, IDS.academyChapter],
  );

  await conn.execute(
    `INSERT INTO video_grants (id, user_id, video_id, granted_by, duration_type, expires_at, created_at)
     VALUES (?, ?, ?, ?, '30d', ?, NOW())
     ON DUPLICATE KEY UPDATE
       granted_by = VALUES(granted_by),
       duration_type = VALUES(duration_type),
       expires_at = VALUES(expires_at)`,
    [IDS.academyGrant, IDS.member, IDS.academyVideo, IDS.admin, addDays(30)],
  );
}

async function seedStudio(conn) {
  await conn.execute(
    `INSERT INTO studio_staff_profiles (
       id, user_id, name, role_code, employment_type, phone, app_connection_status, color, status,
       can_manage_schedule, can_view_members, can_manage_passes, can_view_sales,
       salary_type, base_pay, hourly_wage, commission_rate, memo, created_at, updated_at
     )
     VALUES (?, ?, ?, 'instructor', 'full_time', ?, 'connected', '#4aa3ff', 'active', 1, 1, 1, 0, 'fixed', 0, 0, 0, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       name = VALUES(name),
       role_code = VALUES(role_code),
       employment_type = VALUES(employment_type),
       phone = VALUES(phone),
       app_connection_status = VALUES(app_connection_status),
       color = VALUES(color),
       status = VALUES(status),
       can_manage_schedule = VALUES(can_manage_schedule),
       can_view_members = VALUES(can_view_members),
       can_manage_passes = VALUES(can_manage_passes),
       updated_at = NOW()`,
    [IDS.staffInstructor, IDS.studioStaff, "E2E 필라테스 강사", "01090002001", "E2E 테스트 강사"],
  );

  await conn.execute(
    `INSERT INTO studio_member_profiles (
       user_id, app_connection_status, member_status, gender, birth_date, address,
       address_detail, primary_instructor, registered_at, created_at, updated_at
     )
     VALUES (?, 'connected', 'active', 'female', '1990-01-01', 'E2E 테스트 주소', 'E2E 상세', 'E2E 필라테스 강사', NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       app_connection_status = VALUES(app_connection_status),
       member_status = VALUES(member_status),
       gender = VALUES(gender),
       birth_date = VALUES(birth_date),
       address = VALUES(address),
       address_detail = VALUES(address_detail),
       primary_instructor = VALUES(primary_instructor),
       updated_at = NOW()`,
    [IDS.studioMember],
  );

  await conn.execute(
    `INSERT INTO studio_booking_policies (
       id, reserve_limit_hours, cancel_limit_hours, same_day_change_allowed, updated_at
     )
     VALUES (?, 0, 0, 1, NOW())
     ON DUPLICATE KEY UPDATE
       reserve_limit_hours = VALUES(reserve_limit_hours),
       cancel_limit_hours = VALUES(cancel_limit_hours),
       same_day_change_allowed = VALUES(same_day_change_allowed),
       updated_at = NOW()`,
    [IDS.studioPolicy],
  );

  await conn.execute(
    `INSERT INTO studio_pass_products (
       id, branch_id, name, pass_type, class_type, capacity, total_count, valid_days,
       price, color, is_featured, status, description, created_at, updated_at
     )
     VALUES (?, 'branch-1', ?, 'count', 'group', 6, 10, 90, 1000, '#4aa3ff', 1, 'active', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       name = VALUES(name),
       pass_type = VALUES(pass_type),
       class_type = VALUES(class_type),
       capacity = VALUES(capacity),
       total_count = VALUES(total_count),
       valid_days = VALUES(valid_days),
       price = VALUES(price),
       color = VALUES(color),
       is_featured = VALUES(is_featured),
       status = VALUES(status),
       description = VALUES(description),
       updated_at = NOW()`,
    [IDS.passProduct, "E2E 그룹 수강권 10회", "E2E 테스트 전용 수강권 상품"],
  );

  await conn.execute(
    `INSERT INTO studio_passes (
       id, user_id, branch_id, pass_name, pass_type, remaining_count, reservable_count,
       cancellable_count, total_count, expires_at, is_family_pass, status, created_at, updated_at, pass_product_id
     )
     VALUES (?, ?, 'branch-1', ?, 'group', 9, 9, 9, 10, ?, 0, 'active', NOW(), NOW(), ?)
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       pass_name = VALUES(pass_name),
       pass_type = VALUES(pass_type),
       remaining_count = VALUES(remaining_count),
       reservable_count = VALUES(reservable_count),
       cancellable_count = VALUES(cancellable_count),
       total_count = VALUES(total_count),
       expires_at = VALUES(expires_at),
       status = VALUES(status),
       pass_product_id = VALUES(pass_product_id),
       updated_at = NOW()`,
    [IDS.studioPass, IDS.studioMember, "E2E 그룹 수강권 10회", addDays(90), IDS.passProduct],
  );

  await conn.execute(
    `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
     VALUES (?, ?, ?, NULL, 10, 'e2e_seed_issue', NOW())
     ON DUPLICATE KEY UPDATE
       pass_id = VALUES(pass_id),
       user_id = VALUES(user_id),
       class_id = VALUES(class_id),
       delta_count = VALUES(delta_count),
       reason = VALUES(reason)`,
    [IDS.studioPassIssueTx, IDS.studioPass, IDS.studioMember],
  );

  const availableStart = addHours(48);
  const availableEnd = addHours(49);
  const reservedStart = addHours(72);
  const reservedEnd = addHours(73);

  await conn.execute(
    `INSERT INTO studio_classes (
       id, branch_id, class_type, title, instructor_name, room_name, start_at, end_at,
       capacity, min_capacity, waitlist_capacity, booking_deadline_at,
       cancellation_deadline_at, cancellation_decision_at, status, repeat_group_id,
       created_by, created_at, updated_at
     )
     VALUES (?, 'branch-1', 'group', ?, 'E2E 필라테스 강사', 'E2E 테스트룸', ?, ?, 6, 1, 3, ?, ?, NULL, 'active', NULL, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       class_type = VALUES(class_type),
       title = VALUES(title),
       instructor_name = VALUES(instructor_name),
       room_name = VALUES(room_name),
       start_at = VALUES(start_at),
       end_at = VALUES(end_at),
       capacity = VALUES(capacity),
       min_capacity = VALUES(min_capacity),
       waitlist_capacity = VALUES(waitlist_capacity),
       booking_deadline_at = VALUES(booking_deadline_at),
       cancellation_deadline_at = VALUES(cancellation_deadline_at),
       status = VALUES(status),
       created_by = VALUES(created_by),
       updated_at = NOW()`,
    [
      IDS.studioClassAvailable,
      "E2E 예약 가능 수업",
      availableStart,
      availableEnd,
      addHours(47),
      addHours(47),
      IDS.admin,
    ],
  );

  await conn.execute(
    `INSERT INTO studio_classes (
       id, branch_id, class_type, title, instructor_name, room_name, start_at, end_at,
       capacity, min_capacity, waitlist_capacity, booking_deadline_at,
       cancellation_deadline_at, cancellation_decision_at, status, repeat_group_id,
       created_by, created_at, updated_at
     )
     VALUES (?, 'branch-1', 'group', ?, 'E2E 필라테스 강사', 'E2E 테스트룸', ?, ?, 6, 1, 3, ?, ?, NULL, 'active', NULL, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       class_type = VALUES(class_type),
       title = VALUES(title),
       instructor_name = VALUES(instructor_name),
       room_name = VALUES(room_name),
       start_at = VALUES(start_at),
       end_at = VALUES(end_at),
       capacity = VALUES(capacity),
       min_capacity = VALUES(min_capacity),
       waitlist_capacity = VALUES(waitlist_capacity),
       booking_deadline_at = VALUES(booking_deadline_at),
       cancellation_deadline_at = VALUES(cancellation_deadline_at),
       status = VALUES(status),
       created_by = VALUES(created_by),
       updated_at = NOW()`,
    [
      IDS.studioClassReserved,
      "E2E 예약 내역 수업",
      reservedStart,
      reservedEnd,
      addHours(71),
      addHours(71),
      IDS.admin,
    ],
  );

  await conn.execute(
    `INSERT INTO studio_bookings (id, class_id, user_id, pass_id, status, booked_at, cancelled_at)
     VALUES (?, ?, ?, ?, 'reserved', NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       class_id = VALUES(class_id),
       user_id = VALUES(user_id),
       pass_id = VALUES(pass_id),
       status = VALUES(status),
       booked_at = NOW(),
       cancelled_at = NULL`,
    [IDS.studioBooking, IDS.studioClassReserved, IDS.studioMember, IDS.studioPass],
  );

  await conn.execute(
    `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
     VALUES (?, ?, ?, ?, -1, 'e2e_seed_booking', NOW())
     ON DUPLICATE KEY UPDATE
       pass_id = VALUES(pass_id),
       user_id = VALUES(user_id),
       class_id = VALUES(class_id),
       delta_count = VALUES(delta_count),
       reason = VALUES(reason)`,
    [IDS.studioPassBookingTx, IDS.studioPass, IDS.studioMember, IDS.studioClassReserved],
  );

  await conn.execute(
    `INSERT INTO studio_consultations (
       id, type, staff_name, customer_name, customer_phone, consult_date,
       start_time, end_time, memo, user_id, created_at, updated_at
     )
     VALUES (?, 'phone', 'E2E 필라테스 강사', 'E2E 상담고객', '01090003001', CURDATE(), '10:00:00', '10:30:00', 'E2E 테스트 상담', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       staff_name = VALUES(staff_name),
       customer_name = VALUES(customer_name),
       customer_phone = VALUES(customer_phone),
       consult_date = VALUES(consult_date),
       start_time = VALUES(start_time),
       end_time = VALUES(end_time),
       memo = VALUES(memo),
       user_id = VALUES(user_id),
       updated_at = NOW()`,
    [IDS.consultation, IDS.member],
  );
}

async function seedRefunds(conn) {
  const educationEmail = "e2e_education_member@example.test";

  await conn.execute(
    `INSERT INTO refund_requests (
       id, order_id, user_id, customer_email, customer_email_hash,
       selected_product_ids, requested_amount, reason, status, admin_note,
       created_at, resolved_at
     )
     VALUES (?, ?, ?, ?, ?, JSON_ARRAY(?), 1000, 'E2E refund request', 'pending', NULL, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       order_id = VALUES(order_id),
       user_id = VALUES(user_id),
       customer_email = VALUES(customer_email),
       customer_email_hash = VALUES(customer_email_hash),
       selected_product_ids = VALUES(selected_product_ids),
       requested_amount = VALUES(requested_amount),
       reason = VALUES(reason),
       status = 'pending',
       admin_note = NULL,
       resolved_at = NULL`,
    [
      IDS.academyRefundRequest,
      IDS.academyOrder,
      IDS.educationMember,
      encryptPii(educationEmail),
      emailHash(educationEmail),
      IDS.academyProduct,
    ],
  );

  await conn.execute(
    `INSERT INTO studio_pass_refunds (
       id, pass_id, user_id, refund_amount, reason, status, requested_at, resolved_at
     )
     VALUES (?, ?, ?, 1000, 'E2E studio pass refund request', 'requested', NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       pass_id = VALUES(pass_id),
       user_id = VALUES(user_id),
       refund_amount = VALUES(refund_amount),
       reason = VALUES(reason),
       status = 'requested',
       resolved_at = NULL`,
    [IDS.studioPassRefund, IDS.studioPass, IDS.studioMember],
  );
}

async function seedCommunity(conn) {
  const today = new Date().toISOString().slice(0, 10);

  await conn.execute(
    `INSERT INTO review_posts (id, title, content, image_url, video_url, author, author_id, date, views, created_at)
     VALUES (?, ?, ?, NULL, NULL, 'E2E 일반회원', ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       content = VALUES(content),
       author = VALUES(author),
       author_id = VALUES(author_id),
       date = VALUES(date)`,
    [IDS.reviewPost, "E2E 후기 게시글", "E2E 테스트용 후기입니다.", IDS.member, today],
  );

  await conn.execute(
    `INSERT INTO events (id, title, status, start_date, end_date, likes, image, summary)
     VALUES (?, ?, 'active', ?, ?, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       status = VALUES(status),
       start_date = VALUES(start_date),
       end_date = VALUES(end_date),
       image = VALUES(image),
       summary = VALUES(summary)`,
    [
      IDS.event,
      "E2E 이벤트",
      today,
      addDays(30).slice(0, 10),
      EVENT_PLACEHOLDER_IMAGE,
      "E2E 테스트용 이벤트입니다.",
    ],
  );

  await conn.execute(
    `INSERT INTO inquiry_posts (
       id, title, content, image_url, video_url, author, author_id, date, views, is_secret, created_at
     )
     VALUES (?, ?, ?, NULL, NULL, 'E2E 일반회원', ?, ?, 0, 0, NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       content = VALUES(content),
       author = VALUES(author),
       author_id = VALUES(author_id),
       date = VALUES(date),
       is_secret = VALUES(is_secret)`,
    [IDS.inquiryPost, "E2E 문의 게시글", "E2E 테스트용 문의입니다.", IDS.member, today],
  );

  await conn.execute(
    `INSERT INTO inquiry_replies (id, inquiry_id, author_id, author_name, content, created_at)
     VALUES (?, ?, ?, 'E2E 관리자', ?, NOW())
     ON DUPLICATE KEY UPDATE
       inquiry_id = VALUES(inquiry_id),
       author_id = VALUES(author_id),
       author_name = VALUES(author_name),
       content = VALUES(content)`,
    [IDS.inquiryReply, IDS.inquiryPost, IDS.admin, "E2E 테스트 답변입니다."],
  );
}

async function readSeedCounts(conn) {
  const countOne = async (sql, values = []) => {
    const [rows] = await conn.execute(sql, values);
    return Number(rows?.[0]?.count || 0);
  };

  return {
    users: await countOne(`SELECT COUNT(*) AS count FROM users WHERE login_id LIKE 'e2e\\_%'`),
    academyVideos: await countOne(`SELECT COUNT(*) AS count FROM academy_videos WHERE id LIKE 'e2e\\_%'`),
    academyAccess: await countOne(
      `SELECT COUNT(*) AS count FROM orders WHERE id LIKE 'e2e\\_%'`,
    ),
    studioPasses: await countOne(`SELECT COUNT(*) AS count FROM studio_passes WHERE id LIKE 'e2e\\_%'`),
    refundRequests: await countOne(
      `SELECT COUNT(*) AS count FROM refund_requests WHERE id LIKE 'e2e\\_%'`,
    ),
    studioPassRefunds: await countOne(
      `SELECT COUNT(*) AS count FROM studio_pass_refunds WHERE id LIKE 'e2e\\_%'`,
    ),
    studioClasses: await countOne(`SELECT COUNT(*) AS count FROM studio_classes WHERE id LIKE 'e2e\\_%'`),
    studioBookings: await countOne(`SELECT COUNT(*) AS count FROM studio_bookings WHERE id LIKE 'e2e\\_%'`),
    community: await countOne(
      `SELECT
         (SELECT COUNT(*) FROM review_posts WHERE id LIKE 'e2e\\_%') +
         (SELECT COUNT(*) FROM events WHERE id LIKE 'e2e\\_%') +
         (SELECT COUNT(*) FROM inquiry_posts WHERE id LIKE 'e2e\\_%') AS count`,
    ),
  };
}

async function main() {
  assertSafeSeedEnv();

  const conn = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    charset: "utf8mb4",
    timezone: "+09:00",
  });

  try {
    await assertConnectedToTestDb(conn);
    await assertRequiredTables(conn);
    await conn.beginTransaction();

    try {
      await seedUsers(conn);
      await seedAcademy(conn);
      await seedStudio(conn);
      await seedRefunds(conn);
      await seedCommunity(conn);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }

    const counts = await readSeedCounts(conn);
    console.log(
      JSON.stringify(
        {
          ok: true,
          targetDatabaseOk: true,
          passwordPrinted: false,
          externalCalls: false,
          paymentRefundCalls: false,
          counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || "E2E seed failed",
        passwordPrinted: false,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
