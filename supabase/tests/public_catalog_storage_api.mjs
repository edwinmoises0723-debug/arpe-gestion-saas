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

const checkPublicObject = async (owner, business, folder, file) => {
  const path = `${owner}/${business}/${folder}/${file}`
  const url = anonymous.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const response = await fetch(url, { cache: 'no-store' })
  return response.status
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

assert.equal(await checkPublicObject(ownerB.ownerId, ownerB.businessId, 'products', bProduct.split('/').at(-1)), 200)
await ownerA.client.storage.from(bucket).remove([bProduct])
assert.equal(await checkPublicObject(ownerB.ownerId, ownerB.businessId, 'products', bProduct.split('/').at(-1)), 200,
  'owner A cannot delete owner B object')
await anonymous.storage.from(bucket).remove([aProduct])
assert.equal(await checkPublicObject(ownerA.ownerId, ownerA.businessId, 'products', aProduct.split('/').at(-1)), 200,
  'anonymous visitors cannot delete media')

assert.ifError((await ownerA.client.storage.from(bucket).remove([aProduct])).error)
assert.notEqual(await checkPublicObject(ownerA.ownerId, ownerA.businessId, 'products', aProduct.split('/').at(-1)), 200,
  'owner A can delete its own product media')
assert.ifError((await ownerA.client.storage.from(bucket).remove([aLogo])).error)
assert.notEqual(await checkPublicObject(ownerA.ownerId, ownerA.businessId, 'profile', aLogo.split('/').at(-1)), 200,
  'owner A can delete its own profile media')
assert.ifError((await ownerB.client.storage.from(bucket).remove([bProduct])).error)
assert.notEqual(await checkPublicObject(ownerB.ownerId, ownerB.businessId, 'products', bProduct.split('/').at(-1)), 200,
  'owner B can delete its own product media')

console.log('Storage API ownership, valid paths, cross-tenant denial, anonymous denial and owner deletes passed.')
