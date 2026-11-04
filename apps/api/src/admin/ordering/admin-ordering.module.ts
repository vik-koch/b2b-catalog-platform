import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { SessionModule } from '../../platform/auth/session.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { StaffOrdersService } from './staff-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { StaffOrderDocumentsController } from './staff-order-documents.controller';

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
