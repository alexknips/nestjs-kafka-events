import {
  DynamicModule,
  Global,
  Module,
  OnModuleInit,
  Provider,
} from '@nestjs/common';
import { MetadataScanner } from '@nestjs/core';
import { KafkaDeserializer } from './deserializer';
import {
  IKafkaModuleOptionsFactory,
  IKafkaModuleRegisterAsyncOptions,
} from './interfaces';
import { KafkaEventFunctionsService } from './kafka-event-functions.service';
import { KafkaService } from './kafka.service';
import { KafkaLogger } from './loggers';
import {
  KafkaModuleConfigurationProvider,
  KAFKA_MODULE_CONFIGURATION,
} from './providers';
import { KafkaSerializer } from './serializer';

export const KAFKA_SERVICE = 'KAFKA_SERVICE';

@Global()
@Module({
  providers: [KafkaEventFunctionsService, MetadataScanner, KafkaLogger],
})
export class KafkaModule implements OnModuleInit {
  constructor(
    private readonly kafkaEventFunctionsService: KafkaEventFunctionsService,
  ) {}

  /**
   * Register asynchronously
   * @param options
   */
  public static registerAsync(
    options: IKafkaModuleRegisterAsyncOptions,
  ): DynamicModule {
    // const svc: Provider = {
    //   provide: KafkaService,
    //   useClass: KafkaService,
    // };
    const svc: Provider = {
      provide: KAFKA_SERVICE,
      // useClass: KafkaService, // This option is only available on factory providers! ->  https://docs.nestjs.com/fundamentals/custom-providers#factory-providers-usefactory
      useFactory: () => KafkaService,

      // useFactory: (kafkaModuleConfigurationProvider: KafkaModuleConfigurationProvider,
      //   kafkaEventFunctionsService: KafkaEventFunctionsService) => {
      //   const options = optionsProvider.get();
      //   return new KafkaService());
      // },

      inject: [KafkaModuleConfigurationProvider, KafkaEventFunctionsService],
    };

    const kafkaModuleConfigurationProvider: Provider =
      this.createKafkaModuleConfigurationProvider(options);
    return {
      module: KafkaModule,
      global: true,
      imports: options?.imports || [],
      providers: [
        kafkaModuleConfigurationProvider,
        KafkaModuleConfigurationProvider,
        KafkaDeserializer,
        KafkaSerializer,
        KafkaLogger,
        KafkaService,
        svc,
      ],
      exports: [kafkaModuleConfigurationProvider, svc],
    };
  }

  /**
   * Create Configuration Provider
   * @param options
   * @private
   */
  private static createKafkaModuleConfigurationProvider(
    options: IKafkaModuleRegisterAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: KAFKA_MODULE_CONFIGURATION,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }
    return {
      provide: KAFKA_MODULE_CONFIGURATION,
      useFactory: async (optionsFactory: IKafkaModuleOptionsFactory) =>
        await optionsFactory.creatKafkaModuleOptions(),
      inject: [options.useExisting || options.useClass],
    };
  }

  /**
   * Explore all registered event handlers
   */
  onModuleInit() {
    this.kafkaEventFunctionsService.explore();
  }
}
