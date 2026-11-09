import { Module } from '@nestjs/common';

import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { AdminOrdersController } from './admin-orders.controller';
import { StaffOrderDocumentsController } from './staff-order-documents.controller';
import { StaffOrdersService } from './staff-orders.service';

/** Order handling for staff (FR-ORD-02..05). */
@Module({
  imports: [
    SessionModule,
    OrderingCoreModule,
    // Whether an external system holds order processing (FR-ADM-10).
    OwnershipStateModule,
  ],
  controllers: [AdminOrdersController, StaffOrderDocumentsController],
  providers: [StaffOrdersService, AuditLogger],
})
export class AdminOrderingModule {}
