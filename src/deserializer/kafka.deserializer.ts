import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { Injectable } from '@nestjs/common';
import { KafkaMessage } from 'kafkajs';
import {
  IKafkaEvent,
  IKafkaModuleSchemaRegistryConfiguration
} from '../interfaces';
import { KafkaLogger } from '../loggers';

@Injectable()
export class KafkaDeserializer {
  private schemaRegistry: SchemaRegistry;

  constructor(private readonly kafkaLogger: KafkaLogger) {}

  /**
   * Initialize Schema Registry and try to connect by
   * doing a sample request.
   * @param configuration
   * @param randomSubject
   */
  async initialize(
    configuration: IKafkaModuleSchemaRegistryConfiguration,
    randomSubject?: string,
  ): Promise<void> {
    this.schemaRegistry = new SchemaRegistry(
      configuration.api,
      configuration?.options,
    );
    if (!randomSubject) {
      return;
    }
    try {
      await this.schemaRegistry.getLatestSchemaId(randomSubject);
    } catch (reject) {
      this.kafkaLogger.error(
        `Error while testing schema registry connection (tested subject: ${randomSubject})`,
      );
      throw reject;
    }
  }

  /**
   * Deserialize message from Kafka using Schema Registry
   * @param message
   */
  async deserialize(message: KafkaMessage): Promise<IKafkaEvent> {
    // If we cannot deserialize the key schema, that's ok
    // catch within an anomomous function so an error just returns null
    const key = await (async () => {
      try {
        const key = await this.schemaRegistry.decode(message.key);
        return key;
      } catch (error) {
        // TODO make this work for more than string
        return String.fromCharCode(... message.key);
      }
    })();

    try {
      const event = message?.value
        ? await this.schemaRegistry.decode(message.value)
        : message?.value;
      return {
        arrival: new Date(Number(message.timestamp)) ?? new Date(),
        event,
        key,
      };
    } catch (reject) {
      this.kafkaLogger.error(
        `Error while deserializing message -> Offset: ${message.offset} Key: ${message.key} Reason: ${reject}`,
      );
      throw reject;
    }
  }
}
