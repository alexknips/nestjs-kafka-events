import { KafkaSerializer } from './kafka.serializer';
import { Test, TestingModule } from '@nestjs/testing';
import { KafkaLogger } from '../loggers';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
jest.mock('@kafkajs/confluent-schema-registry');

describe('KafkaSerializer', () => {
  let kafkaSerializer: KafkaSerializer;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaSerializer,
        {
          provide: KafkaLogger,
          useValue: {
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    kafkaSerializer = module.get<KafkaSerializer>(KafkaSerializer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.resetModules();
  });

  it('should be defined', () => {
    expect(kafkaSerializer).toBeDefined();
  });

  it('should initialize correctly and fetch all schemas initially', async () => {
    const getLatestSchemaId = jest
      .spyOn(SchemaRegistry.prototype, 'getLatestSchemaId')
      .mockResolvedValue(10);

    await kafkaSerializer.initialize(
      {
        api: { host: 'http://my-host.com:9093' },
      },
      ['test.topic1', 'test.topic2'],
    );
    expect(SchemaRegistry).toHaveBeenCalledWith(
      {
        host: 'http://my-host.com:9093',
      },
      undefined,
    );
    expect(kafkaSerializer.schemas.get('test.topic1')).toEqual({
      keyId: 10,
      valueId: 10,
    });
    expect(kafkaSerializer.schemas.get('test.topic2')).toEqual({
      keyId: 10,
      valueId: 10,
    });
    expect(getLatestSchemaId).toHaveBeenCalledTimes(4);
  });

  it('should serialize a given payload', async () => {
    await expect(
      kafkaSerializer.serialize({
        event: {
          name: 'test',
        },
        key: {
          id: 'test',
        },
        topic: 'undefined.topic',
      }),
    ).resolves.toEqual(undefined);

    const encode = jest
      .spyOn(SchemaRegistry.prototype, 'encode')
      .mockImplementation(async (id: number, data: any) => {
        if (id === 10) {
          return Buffer.from('test-key');
        }
        return Buffer.from('test-val');
      });
    kafkaSerializer['schemaRegistry'] = new SchemaRegistry({ host: '' });
    kafkaSerializer.schemas.set('test.topic.new', {
      keyId: 10,
      valueId: 20,
    });

    const result1 = await kafkaSerializer.serialize({
      topic: 'test.topic.new',
      event: {
        name: 'test',
      },
      key: {
        id: 'test',
      },
    });
    expect(result1.value).toEqual(Buffer.from('test-val'));
    expect(result1.key).toEqual(Buffer.from('test-key'));

    kafkaSerializer.schemas.set('test.topic.new', {
      valueId: 20,
      keyId: null,
    });

    const result2 = await kafkaSerializer.serialize({
      topic: 'test.topic.new',
      event: {
        name: 'test',
      },
      key: 'test-key',
    });
    expect(result2.value).toEqual(Buffer.from('test-val'));
    expect(result2.key).toEqual('test-key');
  });
});
