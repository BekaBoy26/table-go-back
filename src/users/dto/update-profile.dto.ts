import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Fields a user can change themselves; the email is the login and the avatar comes from Google. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;
}
