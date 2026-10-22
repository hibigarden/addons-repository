import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import create from '../addons/typing-speed/index.js'
import { typingSpeed } from '../addons/typing-speed/speed.js'

test('the estimate uses typed characters and resets after a pause', () => {
  const speed = typingSpeed()
  assert.deepEqual(speed.read(0), { cpm: 0, wpm: 0 })
  speed.add(5, 0)
  speed.add(5, 2000)
  assert.deepEqual(speed.read(2000), { cpm: 300, wpm: 60 })
  assert.deepEqual(speed.read(7000), { cpm: 0, wpm: 0 })
})

test('the addon shows both estimates in the status bar and stops its timer', (t) => {
  mock.timers.enable({ apis: ['setInterval'] })
  t.after(() => mock.timers.reset())
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const items = new Map()
  let input
  const addon = create()
  addon.start({
    statusBar: {
      register: (item) => {
        items.set(item.id, item.label)
        return { update: ({ label }) => items.set(item.id, label) }
      },
    },
    editor: { onInput: (listener) => (input = listener) },
  })
  assert.deepEqual(Object.fromEntries(items), { wpm: '≈0 WPM', cpm: '≈0 CPM' })
  input({ characters: 10 })
  now = 2000
  input({ characters: 10 })
  mock.timers.tick(1000)
  assert.deepEqual(Object.fromEntries(items), {
    wpm: '≈120 wpm',
    cpm: '≈600 cpm',
  })
  addon.stop()
  input({ characters: 100 })
  mock.timers.tick(5000)
  assert.equal(items.get('cpm'), '≈600 cpm')
})
