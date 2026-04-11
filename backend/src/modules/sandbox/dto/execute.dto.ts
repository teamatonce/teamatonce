import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO for POST /api/v1/sandbox/execute.
 *
 * Upper bounds on timeLimitSeconds / memoryLimitKb / source length
 * exist so that an authenticated user can't submit a pathologically
 * large request to burn real compute at the judge0/piston provider.
 * The controller's JwtAuthGuard gates *who* can call this endpoint;
 * this DTO gates *how big* any single call can be.
 */
export class ExecuteDto {
  /**
   * Language id: "javascript", "python", "cpp", "rust", etc.
   * Small regex-able string to keep random garbage out of provider
   * payloads.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  language!: string;

  /** Source code to run. Max 64KB. */
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  source!: string;

  /** Optional stdin. Max 32KB. */
  @IsOptional()
  @IsString()
  @MaxLength(32768)
  stdin?: string;

  /**
   * Max runtime in seconds. 1..15 — tight upper bound so a compromised
   * account can't submit `timeLimitSeconds: 99999` to DoS the provider.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  timeLimitSeconds?: number;

  /**
   * Max memory in KB. 16384 (16 MB)..512000 (500 MB).
   * Anything larger is usually a sign of abuse or a misuse.
   */
  @IsOptional()
  @IsInt()
  @Min(16_384)
  @Max(512_000)
  memoryLimitKb?: number;

  /**
   * Optional command-line args. Capped at 32 args of 256 chars each
   * so a caller can't stuff megabytes into argv and bypass the
   * `source` cap.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  commandLineArgs?: string[];
}
