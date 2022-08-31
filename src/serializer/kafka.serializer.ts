import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { Injectable } from '@nestjs/common';
import { Message } from 'kafkajs';
import {
  getSchemaRegistryKeySubjectByTopic,
  getSchemaRegistryValueSubjectByTopic
} from '../helpers/topic-subject.helper';
import {
  EmitKafkaEventPayload,
  IKafkaModuleSchemaRegistryConfiguration
} from '../interfaces';
import { KafkaLogger } from '../loggers';

@Injectable()
export class KafkaSerializer {
  private schemaRegistry: SchemaRegistry;
  schemas: Map<string, { keyId: number | null; valueId: number }> = new Map();

  constructor(private readonly kafkaLogger: KafkaLogger) {}

  /**
   * Initialize
   * @param configuration
   * @param topics
   */
  async initialize(
    configuration: IKafkaModuleSchemaRegistryConfiguration,
    topics: string[],
  ): Promise<void> {
    this.schemaRegistry = new SchemaRegistry(
      configuration.api,
      configuration?.options,
    );
    await this.fetchAllSchemaIds(topics);
  }

  /**
   * Fetch all schemas initially
   * @param topics
   * @private
   */
  private async fetchAllSchemaIds(topics: string[]): Promise<void> {
    for await (const topic of topics) {
      await this.fetchSchemaIds(topic);
    }
  }

  /**
   * Fetch a single schema by topic and store in internal schema map
   * @param topic
   * @private
   */
  private async fetchSchemaIds(topic: string): Promise<void> {
    try {
      // If we cannot find the schema for the key, that's ok
      // catch within an anomomous function so an error just returns null
      const keyId = await (async () => {
        try {
          const x =
            (await this.schemaRegistry.getLatestSchemaId(
              getSchemaRegistryKeySubjectByTopic(topic),
            )) || null;
          return x;
        } catch (error) {
          return null;
        }
      })();

      const valueId = await this.schemaRegistry.getLatestSchemaId(
        getSchemaRegistryValueSubjectByTopic(topic),
      );
      this.schemas.set(topic, {
        keyId,
        valueId,
      });
    } catch (reject) {
      this.kafkaLogger.error(
        `Error while fetching schema ids for topic ${topic}`,
        reject,
      );
      throw reject;
    }
  }

  /**
   * Serialize given payload to be compliant with KafkaJS
   * @param value
   */
  async serialize<V, K>(
    value: EmitKafkaEventPayload<V, K> & Omit<Message, 'key' | 'value'>,
  ): Promise<Message | undefined> {
    const ids = this.schemas.get(value.topic);
    if (!ids) {
      this.kafkaLogger.error(
        `Trying to serialize message in topic ${value.topic} failed: No schema ids found.`,
      );
      return undefined;
    }
    try {
      const message: Message = {
        value: await this.schemaRegistry.encode(ids.valueId, value.event),
        partition: value?.partition,
        headers: value?.headers,
        timestamp: value?.timestamp,
      };
      if (ids?.keyId) {
        message['key'] = await this.schemaRegistry.encode(ids.keyId, value.key);
      } else {
        // fail-safe...
        if (value.key && typeof value.key === 'string') {
          message['key'] = value.key;
        }
      }
      return message;
    } catch (reject) {
      this.kafkaLogger.error(
        `Error while serializing message: ${JSON.stringify(value)}`,
        reject,
      );
      throw reject;
    }
  }
}
