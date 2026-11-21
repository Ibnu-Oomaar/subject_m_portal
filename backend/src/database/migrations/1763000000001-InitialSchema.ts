import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Generated from the entity metadata by src/database/generate-migration.ts. */
const UP: string[] = [
  "CREATE TABLE \"academic_years\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"label\" character varying(9) NOT NULL, \"start_year\" smallint NOT NULL, \"status\" character varying(10) NOT NULL DEFAULT 'planned', \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_f416aa0a170eddd5d3c224e0d10\" UNIQUE (\"label\"), CONSTRAINT \"UQ_2d07630aacd31e11f605f54ce18\" UNIQUE (\"start_year\"), CONSTRAINT \"CHK_1997e322406171d304df521f87\" CHECK (\"status\" IN ('planned', 'active', 'closed')), CONSTRAINT \"PK_2021b90bfbfa6c9da7df34ca1cf\" PRIMARY KEY (\"id\"))",
  "CREATE UNIQUE INDEX \"uq_academic_years_single_active\" ON \"academic_years\"  (\"status\") WHERE \"status\" = 'active'",
  "CREATE TABLE \"assessment_categories\" (\"code\" character varying(40) NOT NULL, \"name\" character varying(80) NOT NULL, \"max_marks\" numeric(5,2) NOT NULL, \"sort_order\" smallint NOT NULL, CONSTRAINT \"CHK_e768e551e59d99c761d460f744\" CHECK (\"max_marks\" > 0), CONSTRAINT \"PK_c13b3b6ff79da04e882eb98b4d3\" PRIMARY KEY (\"code\"))",
  "CREATE TABLE \"classes\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"grade_level\" smallint NOT NULL, \"name\" character varying(40) NOT NULL, CONSTRAINT \"UQ_fbf9dd2dbffe27a587836bc5ef0\" UNIQUE (\"grade_level\"), CONSTRAINT \"PK_e207aa15404e9b2ce35910f9f7f\" PRIMARY KEY (\"id\"))",
  "CREATE TABLE \"sections\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"class_id\" uuid NOT NULL, \"code\" character varying(4) NOT NULL, \"label\" character varying(12) NOT NULL, CONSTRAINT \"UQ_08b202548a85eedc91036e85fff\" UNIQUE (\"label\"), CONSTRAINT \"UQ_b7a57623dfa0ec87937174b72d5\" UNIQUE (\"class_id\", \"code\"), CONSTRAINT \"PK_f9749dd3bffd880a497d007e450\" PRIMARY KEY (\"id\"))",
  "CREATE TABLE \"students\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"student_id\" character varying(32) NOT NULL, \"full_name\" character varying(150) NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_ba36f3e3743f80d1cdc51020103\" UNIQUE (\"student_id\"), CONSTRAINT \"PK_7d7f07271ad4ce999880713f05e\" PRIMARY KEY (\"id\"))",
  "CREATE TABLE \"enrollments\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"student_id\" uuid NOT NULL, \"academic_year_id\" uuid NOT NULL, \"section_id\" uuid NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_dd68459cb9b3263d1f847963f61\" UNIQUE (\"student_id\", \"academic_year_id\"), CONSTRAINT \"PK_7c0f752f9fb68bf6ed7367ab00f\" PRIMARY KEY (\"id\"))",
  "CREATE INDEX \"idx_enrollments_year_section\" ON \"enrollments\"  (\"academic_year_id\", \"section_id\") ",
  "CREATE TABLE \"teachers\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"name\" character varying(120) NOT NULL, \"name_normalized\" character varying(120) NOT NULL, \"passcode_hash\" text, \"is_active\" boolean NOT NULL DEFAULT true, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_4e1d2b1681158704412136d1463\" UNIQUE (\"name_normalized\"), CONSTRAINT \"PK_a8d4f83be3abe4c687b0a0093c8\" PRIMARY KEY (\"id\"))",
  "CREATE TABLE \"assessments\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"enrollment_id\" uuid NOT NULL, \"term\" smallint NOT NULL, \"class_activities\" numeric(4,2), \"homework_assignments\" numeric(4,2), \"learning_materials_notebook\" numeric(4,2), \"textbook\" numeric(4,2), \"status\" character varying(10) NOT NULL DEFAULT 'entered', \"version\" integer NOT NULL DEFAULT '1', \"updated_by_id\" uuid, \"finalized_at\" TIMESTAMP WITH TIME ZONE, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_a48af0b8c2ba123634109b5db11\" UNIQUE (\"enrollment_id\", \"term\"), CONSTRAINT \"CHK_ddccdfdb5c350c7696289d8538\" CHECK (\"status\" IN ('entered', 'finalized')), CONSTRAINT \"CHK_99def4f4b362c09181c9983a30\" CHECK (\"textbook\" IS NULL OR (\"textbook\" >= 0 AND \"textbook\" <= 5)), CONSTRAINT \"CHK_9b6ea180da4366953ac65b27a5\" CHECK (\"learning_materials_notebook\" IS NULL OR (\"learning_materials_notebook\" >= 0 AND \"learning_materials_notebook\" <= 10)), CONSTRAINT \"CHK_6b7f18ebc58310e2249482bc5a\" CHECK (\"homework_assignments\" IS NULL OR (\"homework_assignments\" >= 0 AND \"homework_assignments\" <= 6)), CONSTRAINT \"CHK_13cf56bc2a65894b7301f81af6\" CHECK (\"class_activities\" IS NULL OR (\"class_activities\" >= 0 AND \"class_activities\" <= 9)), CONSTRAINT \"CHK_199744e1b94dc5bd7ce00efd11\" CHECK (\"term\" BETWEEN 1 AND 3), CONSTRAINT \"PK_a3442bd80a00e9111cefca57f6c\" PRIMARY KEY (\"id\"))",
  "CREATE INDEX \"idx_assessments_enrollment\" ON \"assessments\"  (\"enrollment_id\") ",
  "CREATE TABLE \"examinations\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"academic_year_id\" uuid NOT NULL, \"section_id\" uuid NOT NULL, \"term\" smallint NOT NULL, \"name\" character varying(120) NOT NULL, \"max_marks\" numeric(6,2) NOT NULL, \"exam_date\" date, \"created_by_id\" uuid, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_e5916c71470ac51dd8eab77655b\" UNIQUE (\"academic_year_id\", \"section_id\", \"term\", \"name\"), CONSTRAINT \"CHK_309451688c2129e0839e98524f\" CHECK (\"max_marks\" > 0 AND \"max_marks\" <= 1000), CONSTRAINT \"CHK_23b8db851287ecfdd944b42daa\" CHECK (\"term\" BETWEEN 1 AND 3), CONSTRAINT \"PK_7694851ac6eaf734b64fcf06c28\" PRIMARY KEY (\"id\"))",
  "CREATE INDEX \"idx_examinations_year_section_term\" ON \"examinations\"  (\"academic_year_id\", \"section_id\", \"term\") ",
  "CREATE TABLE \"exam_marks\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"examination_id\" uuid NOT NULL, \"enrollment_id\" uuid NOT NULL, \"marks\" numeric(6,2) NOT NULL, \"status\" character varying(10) NOT NULL DEFAULT 'entered', \"version\" integer NOT NULL DEFAULT '1', \"updated_by_id\" uuid, \"finalized_at\" TIMESTAMP WITH TIME ZONE, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"UQ_7245090bbbbc04dab6ab611d7fd\" UNIQUE (\"examination_id\", \"enrollment_id\"), CONSTRAINT \"CHK_464e954e177dcfcb3a9c9a0c2a\" CHECK (\"status\" IN ('entered', 'finalized')), CONSTRAINT \"CHK_b005b1e2e0369e3178b96b1225\" CHECK (\"marks\" >= 0), CONSTRAINT \"PK_5fe7a30b91652e8af8e256d0bbd\" PRIMARY KEY (\"id\"))",
  "CREATE INDEX \"idx_exam_marks_enrollment\" ON \"exam_marks\"  (\"enrollment_id\") ",
  "CREATE TABLE \"audit_logs\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"actor_type\" character varying(10) NOT NULL, \"actor_id\" uuid, \"action\" character varying(60) NOT NULL, \"entity_type\" character varying(40) NOT NULL, \"entity_id\" uuid, \"batch_id\" uuid, \"academic_year_id\" uuid, \"section_id\" uuid, \"before_data\" jsonb, \"after_data\" jsonb, \"context\" jsonb, \"reason\" text, \"ip_address\" character varying(64), \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"PK_1bb179d048bbc581caa3b013439\" PRIMARY KEY (\"id\"))",
  "CREATE INDEX \"idx_audit_year_created\" ON \"audit_logs\"  (\"academic_year_id\", \"created_at\") ",
  "CREATE INDEX \"idx_audit_batch\" ON \"audit_logs\"  (\"batch_id\") ",
  "CREATE INDEX \"idx_audit_actor\" ON \"audit_logs\"  (\"actor_id\", \"created_at\") ",
  "CREATE INDEX \"idx_audit_entity\" ON \"audit_logs\"  (\"entity_type\", \"entity_id\", \"created_at\") ",
  "CREATE TABLE \"teacher_sections\" (\"id\" uuid NOT NULL DEFAULT gen_random_uuid(), \"teacher_id\" uuid NOT NULL, \"section_id\" uuid NOT NULL, CONSTRAINT \"UQ_6c31202387831772dac2086566d\" UNIQUE (\"teacher_id\", \"section_id\"), CONSTRAINT \"PK_c7ed3528d8fc3b99f67a9b9c8f9\" PRIMARY KEY (\"id\"))",
  "ALTER TABLE \"sections\" ADD CONSTRAINT \"FK_27db91d7369af6f181412afa99f\" FOREIGN KEY (\"class_id\") REFERENCES \"classes\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"enrollments\" ADD CONSTRAINT \"FK_307813fe255896d6ebf3e6cd55c\" FOREIGN KEY (\"student_id\") REFERENCES \"students\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"enrollments\" ADD CONSTRAINT \"FK_1b48da02d1615a115333362b7c4\" FOREIGN KEY (\"academic_year_id\") REFERENCES \"academic_years\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"enrollments\" ADD CONSTRAINT \"FK_ebbb1eaa243b6fd10a61fe38c78\" FOREIGN KEY (\"section_id\") REFERENCES \"sections\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"assessments\" ADD CONSTRAINT \"FK_388609c16e8952fe1a0590880b3\" FOREIGN KEY (\"enrollment_id\") REFERENCES \"enrollments\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"assessments\" ADD CONSTRAINT \"FK_7edd9c96e62e5e317c415b7f26d\" FOREIGN KEY (\"updated_by_id\") REFERENCES \"teachers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION",
  "ALTER TABLE \"examinations\" ADD CONSTRAINT \"FK_67e324d8aa646f58c7a23604b70\" FOREIGN KEY (\"academic_year_id\") REFERENCES \"academic_years\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"examinations\" ADD CONSTRAINT \"FK_794c25dbb34b4c335ac04fc69d6\" FOREIGN KEY (\"section_id\") REFERENCES \"sections\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"examinations\" ADD CONSTRAINT \"FK_dbb9eb4085b6561add21c7e942f\" FOREIGN KEY (\"created_by_id\") REFERENCES \"teachers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION",
  "ALTER TABLE \"exam_marks\" ADD CONSTRAINT \"FK_194207acae6598390176e044a15\" FOREIGN KEY (\"examination_id\") REFERENCES \"examinations\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"exam_marks\" ADD CONSTRAINT \"FK_03b665ce40738d1cad8776056f5\" FOREIGN KEY (\"enrollment_id\") REFERENCES \"enrollments\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE \"exam_marks\" ADD CONSTRAINT \"FK_18610958bc182d7d103d430589f\" FOREIGN KEY (\"updated_by_id\") REFERENCES \"teachers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION",
  "ALTER TABLE \"teacher_sections\" ADD CONSTRAINT \"FK_2a46d3f06e7f4ac56ea37a439d2\" FOREIGN KEY (\"teacher_id\") REFERENCES \"teachers\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE \"teacher_sections\" ADD CONSTRAINT \"FK_cfd5ce7f60b492170a1caea8a52\" FOREIGN KEY (\"section_id\") REFERENCES \"sections\"(\"id\") ON DELETE RESTRICT ON UPDATE NO ACTION",
];

const DOWN: string[] = [
  "ALTER TABLE \"teacher_sections\" DROP CONSTRAINT \"FK_cfd5ce7f60b492170a1caea8a52\"",
  "ALTER TABLE \"teacher_sections\" DROP CONSTRAINT \"FK_2a46d3f06e7f4ac56ea37a439d2\"",
  "ALTER TABLE \"exam_marks\" DROP CONSTRAINT \"FK_18610958bc182d7d103d430589f\"",
  "ALTER TABLE \"exam_marks\" DROP CONSTRAINT \"FK_03b665ce40738d1cad8776056f5\"",
  "ALTER TABLE \"exam_marks\" DROP CONSTRAINT \"FK_194207acae6598390176e044a15\"",
  "ALTER TABLE \"examinations\" DROP CONSTRAINT \"FK_dbb9eb4085b6561add21c7e942f\"",
  "ALTER TABLE \"examinations\" DROP CONSTRAINT \"FK_794c25dbb34b4c335ac04fc69d6\"",
  "ALTER TABLE \"examinations\" DROP CONSTRAINT \"FK_67e324d8aa646f58c7a23604b70\"",
  "ALTER TABLE \"assessments\" DROP CONSTRAINT \"FK_7edd9c96e62e5e317c415b7f26d\"",
  "ALTER TABLE \"assessments\" DROP CONSTRAINT \"FK_388609c16e8952fe1a0590880b3\"",
  "ALTER TABLE \"enrollments\" DROP CONSTRAINT \"FK_ebbb1eaa243b6fd10a61fe38c78\"",
  "ALTER TABLE \"enrollments\" DROP CONSTRAINT \"FK_1b48da02d1615a115333362b7c4\"",
  "ALTER TABLE \"enrollments\" DROP CONSTRAINT \"FK_307813fe255896d6ebf3e6cd55c\"",
  "ALTER TABLE \"sections\" DROP CONSTRAINT \"FK_27db91d7369af6f181412afa99f\"",
  "DROP TABLE \"teacher_sections\"",
  "DROP INDEX \"public\".\"idx_audit_entity\"",
  "DROP INDEX \"public\".\"idx_audit_actor\"",
  "DROP INDEX \"public\".\"idx_audit_batch\"",
  "DROP INDEX \"public\".\"idx_audit_year_created\"",
  "DROP TABLE \"audit_logs\"",
  "DROP INDEX \"public\".\"idx_exam_marks_enrollment\"",
  "DROP TABLE \"exam_marks\"",
  "DROP INDEX \"public\".\"idx_examinations_year_section_term\"",
  "DROP TABLE \"examinations\"",
  "DROP INDEX \"public\".\"idx_assessments_enrollment\"",
  "DROP TABLE \"assessments\"",
  "DROP TABLE \"teachers\"",
  "DROP INDEX \"public\".\"idx_enrollments_year_section\"",
  "DROP TABLE \"enrollments\"",
  "DROP TABLE \"students\"",
  "DROP TABLE \"sections\"",
  "DROP TABLE \"classes\"",
  "DROP TABLE \"assessment_categories\"",
  "DROP INDEX \"public\".\"uq_academic_years_single_active\"",
  "DROP TABLE \"academic_years\"",
];

export class InitialSchema1763000000001 implements MigrationInterface {
  name = 'InitialSchema1763000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql);
  }
}
