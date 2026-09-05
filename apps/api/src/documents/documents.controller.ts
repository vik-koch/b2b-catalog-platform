import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, documentsContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { DocumentsService } from './documents.service';

/**
 * Admin-only throughout, like the rest of the catalog write surface: a
 * certificate is part of what the shop publishes about a product, and a
 * manager never edits the catalog.
 */
@Auth('admin')
@Controller()
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(documentsContract.listDocuments)
  listDocuments() {
    return implement(documentsContract.listDocuments).handler(async () => ({
      documents: await this.service.listDocuments(),
    }));
  }

  @Implement(documentsContract.getDocument)
  getDocument() {
    return implement(documentsContract.getDocument)
      .use(refusals)
      .handler(({ input: { params } }) => this.service.getDocument(params.id));
  }

  @Implement(documentsContract.createDocument)
  createDocument(@CurrentUser() user: AuthUser) {
    return implement(documentsContract.createDocument)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const document = await this.service.createDocument(body, user.id);
        this.audit.record('document.created', user, {
          id: document.id,
          name: document.title,
        });
        return document;
      });
  }

  /**
   * One save covers the file as well as the fields, so a replaced file is
   * `document.updated` like any other edit — what changed is answerable from
   * the row's `fileUrl`, which is a content hash of the bytes now shown.
   */
  @Implement(documentsContract.updateDocument)
  updateDocument(@CurrentUser() user: AuthUser) {
    return implement(documentsContract.updateDocument)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const document = await this.service.updateDocument(
          params.id,
          body,
          user.id,
        );
        this.audit.record('document.updated', user, {
          id: document.id,
          name: document.title,
        });
        return document;
      });
  }

  @Implement(documentsContract.deleteDocument)
  deleteDocument(@CurrentUser() user: AuthUser) {
    return implement(documentsContract.deleteDocument)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const document = await this.service.deleteDocument(params.id);
        this.audit.record('document.deleted', user, {
          id: document.id,
          name: document.title,
        });
        return { message: 'Document deleted' };
      });
  }
}
