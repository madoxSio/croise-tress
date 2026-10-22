import { PASSWORD_MAX, PASSWORD_MIN, emailSchema, usernameSchema } from '@crossverse/contracts'

/*
 * Contrôles de confort avant envoi, fondés sur les schémas partagés de `contracts` :
 * le serveur reste seul juge (il refuse aussi, par exemple, les mots de passe trop courants).
 */

export const PASSWORD_HINT = `Au moins ${PASSWORD_MIN} caractères. Une phrase de plusieurs mots est plus facile à retenir.`
export const USERNAME_HINT =
  'De 3 à 24 caractères : lettres non accentuées, chiffres, _ ou -. Visible des autres joueurs.'

export function emailError(value: string): string | null {
  return emailSchema.safeParse(value.trim()).success ? null : 'Saisissez une adresse e-mail valide.'
}

export function usernameError(value: string): string | null {
  return usernameSchema.safeParse(value).success ? null : USERNAME_HINT
}

export function newPasswordError(value: string): string | null {
  if (value.length < PASSWORD_MIN)
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`
  if (value.length > PASSWORD_MAX)
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX} caractères.`
  return null
}

export function requiredPasswordError(value: string): string | null {
  return value === '' ? 'Saisissez votre mot de passe.' : null
}
