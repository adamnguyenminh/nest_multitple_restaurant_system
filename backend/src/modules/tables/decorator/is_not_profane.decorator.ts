import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsNotProfane(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNotProfane',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const forbiddenWords = ['badword', 'spam', 'hack'];
          return !forbiddenWords.some((word) =>
            value.toLowerCase().includes(word),
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} chứa từ ngữ không cho phép!`;
        },
      },
    });
  };
}
