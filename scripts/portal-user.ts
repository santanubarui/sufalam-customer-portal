/*
 * Portal account admin (run on the portal server):
 *   npm run portal:user -- list
 *   npm run portal:user -- add <email> <cardCode>   link an email to a SAP customer; they set a password via "Forgot password"
 *   npm run portal:user -- disable <email>          blocks sign-in and ends open sessions
 *   npm run portal:user -- enable <email>
 *   npm run portal:user -- remove <email>
 * Most customers don't need this: an email already stored on their SAP business partner activates itself.
 */
import { resolve } from 'node:path'
import { normEmail, UserStore, validEmail } from '../server/accounts'
import { loadEnvFiles } from '../server/env'

const [cmd, email, cardCode] = process.argv.slice(2)
const store = new UserStore(resolve(loadEnvFiles('production').PORTAL_DATA_DIR || 'server-data'))

async function main() {
  if (cmd === 'list') {
    const users = await store.list()
    if (!users.length) return console.log('No portal accounts yet.')
    console.table(
      users.map((u) => ({
        email: u.email,
        customer: u.cardCode,
        name: u.name,
        status: u.status,
        password: u.passwordHash ? 'set' : '—',
        lastLogin: u.lastLoginAt?.slice(0, 16).replace('T', ' ') ?? '—',
      })),
    )
    return
  }
  if (!email || !validEmail(normEmail(email))) throw new Error('Give a valid email address.')
  const u = await store.get(email)

  if (cmd === 'add') {
    if (!cardCode) throw new Error('Usage: add <email> <cardCode>')
    if (u) throw new Error(`${u.email} already exists (customer ${u.cardCode}, ${u.status}).`)
    const now = new Date().toISOString()
    await store.save({ email, cardCode, name: cardCode, status: 'active', sessionVersion: 0, createdAt: now, updatedAt: now })
    return console.log(`Added ${normEmail(email)} → customer ${cardCode}. They can now use "Forgot password" to set a password.`)
  }
  if (!u) throw new Error(`No portal account for ${email}.`)
  if (cmd === 'disable' || cmd === 'enable') {
    u.status = cmd === 'disable' ? 'disabled' : 'active'
    u.sessionVersion++
    await store.save(u)
    return console.log(`${u.email} is now ${u.status}.`)
  }
  if (cmd === 'remove') {
    await store.remove(email)
    return console.log(`Removed ${u.email}.`)
  }
  throw new Error('Commands: list | add <email> <cardCode> | disable <email> | enable <email> | remove <email>')
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
