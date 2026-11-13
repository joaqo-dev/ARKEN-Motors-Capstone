import { PASSWORD_REGEX } from '@vitriauto/shared-types';
import { IsString, Matches } from 'class-validator';
import { MENSAJE_PASSWORD } from './transforms';
import { TokenDto } from './token.dto';

// Usado al aceptar una invitación y al restablecer la contraseña.
export class DefinirPasswordDto extends TokenDto {
  @IsString()
  @Matches(PASSWORD_REGEX, { message: MENSAJE_PASSWORD })
  password!: string;
}
