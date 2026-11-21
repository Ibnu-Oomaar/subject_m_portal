import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { numericTransformer } from '../common/decimal';

/** Read-only reference data, seeded by a migration. There is deliberately no API to change it. */
@Entity('assessment_categories')
@Check(`"max_marks" > 0`)
export class AssessmentCategory {
  @PrimaryColumn({ name: 'code', type: 'varchar', length: 40 })
  code!: string;

  @Column({ name: 'name', type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'max_marks', type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  maxMarks!: number;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder!: number;
}
