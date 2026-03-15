import { BadRequestException } from '@nestjs/common';
import { ExportDatasetRepository } from './export-dataset.repository';

describe('ExportDatasetRepository', () => {
  const createRepository = () =>
    new ExportDatasetRepository({
      $transaction: jest.fn(),
    } as never);

  it('rejects an explicit columns list when none of the requested columns are valid', async () => {
    const repository = createRepository();

    await expect(
      repository.getDataset({
        columns: ['definitely-not-a-real-column'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
