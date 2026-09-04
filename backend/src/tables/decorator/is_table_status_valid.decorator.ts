import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsTableStatusValid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isTableStatusValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const ALLOWED_STATUSES = [
            'AVAILABLE',
            'RESERVED',
            'SEATED',
            'CLEANING',
          ];
          return ALLOWED_STATUSES.includes(value.toUpperCase());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} không hợp lệ!`;
        },
      },
    });
  };
}
