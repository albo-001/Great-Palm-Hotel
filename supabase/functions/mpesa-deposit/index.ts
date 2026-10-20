import { handleMpesaDeposit } from '../_shared/mpesaDepositHandler.ts'

Deno.serve(handleMpesaDeposit)
