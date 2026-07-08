// Esta rota foi movida para /change-password.
// Mantida para não quebrar links antigos.
import { redirect } from 'next/navigation'
export default function OldChangePassword() {
  redirect('/change-password')
}
