import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaTokenDto {
  @ApiProperty({ example: '123456', description: 'TOTP token from authenticator app' })
  @IsString()
  @Length(6, 6)
  token: string;
}

export class DisableMfaDto {
  @ApiProperty({ example: '123456', description: 'TOTP token to confirm MFA disable' })
  @IsString()
  @Length(6, 6)
  token: string;
}

export class UseRecoveryCodeDto {
  @ApiProperty({ example: 'ABCD-1234-EFGH', description: 'One-time recovery code' })
  @IsString()
  recoveryCode: string;
}
