# Khởi tạo NestJS app trong thư mục backend
npx @nestjs/cli new backend --strict --skip-git --package-manager npm
cd backend

# Cài đặt các thư viện kết nối Database, Queue, Config
npm install --save @nestjs/typeorm typeorm mysql2 @nestjs/microservices amqplib amqp-connection-manager @nestjs/config
