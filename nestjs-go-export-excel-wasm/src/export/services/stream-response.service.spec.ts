import { StreamResponseService } from './stream-response.service';

describe('StreamResponseService', () => {
  it('uses sanitized file name for both filename and filename*', () => {
    const service = new StreamResponseService();
    const headers = new Map<string, string>();
    const response = {
      setHeader: jest.fn((name: string, value: string | number) => {
        headers.set(name, String(value));
      }),
    } as never;

    service.prepareDownload(
      response,
      'evil\r\nname";malicious.xlsx'
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n'),
      'application/octet-stream',
    );

    expect(headers.get('Content-Disposition')).toBe(
      `attachment; filename="evilname-malicious.xlsx"; filename*=UTF-8''evilname-malicious.xlsx`,
    );
  });
});
