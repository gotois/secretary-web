import type { DocumentGateway } from '../repositories/document-gateway.ts';

const DOCUMENT_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

export class ProcessDocument {
  documents: DocumentGateway;

  constructor(documents: DocumentGateway) {
    this.documents = documents;
  }

  execute(input: {
    url: string;
    mediaType?: string;
  }): Promise<{ content: string; mediaType: 'text/markdown' | 'text/plain' }> {
    if (!input.mediaType || !DOCUMENT_TYPES.has(input.mediaType)) {
      throw new TypeError(`Неподдерживаемый тип документа: ${input.mediaType ?? 'unknown'}`);
    }
    return this.documents.process(input);
  }
}
