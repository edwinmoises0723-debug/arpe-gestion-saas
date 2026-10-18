import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
assert.ok(supabaseUrl, 'SUPABASE_URL must point to the local CI stack')
assert.ok(anonKey, 'SUPABASE_ANON_KEY must be from the local CI stack')

const bucket = 'ejnexa-catalog-media'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8ioAAAAASUVORK5CYII=',
  'base64',
)
const anonymous = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })

const createOwner = async (label) => {
  const registration = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
  const credentials = {
    email: `catalog-${label}-${randomUUID()}@example.test`,
    password: `LocalOnly-${randomUUID()}-A1!`,
  }
  const { data, error } = await registration.auth.signUp(credentials)
  assert.ifError(error)
  assert.ok(data.user && data.session, 'local email signup should return an authenticated session')

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  })
  const { data: business, error: businessError } = await client
    .from('arpe_businesses')
    .insert({ name: `Storage ${label}` })
    .select('id')
    .single()
  assert.ifError(businessError)
  return { client, ownerId: data.user.id, businessId: business.id }
}

const ownerA = await createOwner('a')
const ownerB = await createOwner('b')
const aProduct = `${ownerA.ownerId}/${ownerA.businessId}/products/${randomUUID()}.png`
const aLogo = `${ownerA.ownerId}/${ownerA.businessId}/profile/${randomUUID()}.png`
const bProduct = `${ownerB.ownerId}/${ownerB.businessId}/products/${randomUUID()}.png`

const upload = async (client, path) => client.storage.from(bucket).upload(path, png, {
  contentType: 'image/png',
  upsert: false,
})
const assertObjectAvailable = async (client, path, message) => {
  const { data, error } = await client.storage.from(bucket).download(path)
  assert.ifError(error)
  assert.equal(Buffer.compare(Buffer.from(await data.arrayBuffer()), png), 0, message)
}

assert.ifError((await upload(ownerA.client, aProduct)).error)
assert.ifError((await upload(ownerA.client, aLogo)).error)
assert.ifError((await upload(ownerB.client, bProduct)).error)

assert.ok((await upload(ownerA.client, `${ownerA.ownerId}/${ownerB.businessId}/products/cross-business.png`)).error,
  'owner A cannot upload inside owner B business')
assert.ok((await upload(ownerA.client, `${ownerB.ownerId}/${ownerA.businessId}/products/cross-owner.png`)).error,
  'owner A cannot upload under owner B folder')
assert.ok((await upload(ownerA.client, `${ownerA.ownerId}/${ownerA.businessId}/private/unsupported.png`)).error,
  'unsupported folders are rejected')
assert.ok((await upload(ownerA.client, `${ownerA.ownerId}/${ownerA.businessId}/products/nested/file.png`)).error,
  'nested paths are rejected')
assert.ok((await upload(anonymous, aProduct)).error, 'anonymous visitors cannot upload media')

const remove = async (client, path) => client.storage.from(bucket).remove([path])
const assertDeleteDenied = async (client, reader, path, message) => {
  const { error } = await remove(client, path)
  assert.ifError(error)
  await assertObjectAvailable(reader, path, message)
}
const assertDeleteAllowed = async (client, path, message) => {
  const { error } = await remove(client, path)
  assert.ifError(error)
  const { error: uploadError } = await upload(client, path)
  assert.ifError(uploadError, message)
}

await assertDeleteDenied(ownerA.client, ownerB.client, bProduct, 'owner A cannot delete owner B object')
await assertDeleteDenied(anonymous, ownerA.client, aProduct, 'anonymous visitors cannot delete media')
await assertDeleteAllowed(ownerA.client, aProduct, 'owner A can delete its own product media')
await assertDeleteAllowed(ownerA.client, aLogo, 'owner A can delete its own profile media')
await assertDeleteAllowed(ownerB.client, bProduct, 'owner B can delete its own product media')

console.log('Storage API ownership, valid paths, cross-tenant denial, anonymous denial and owner deletes passed.')
