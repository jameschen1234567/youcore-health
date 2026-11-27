import { describe, expect, it } from 'vitest'
import { groupSets, numberSets } from './training'

describe('組數編號', () => {
  it('同一動作依序編號、記錄輸入順序、略過空列', () => {
    const out = numberSets([
      { exercise_id: 'sq', weight_kg: '100', reps: '5', rpe: '8' },
      { exercise_id: 'bp', weight_kg: 60, reps: 8, rpe: '' },
      { exercise_id: 'sq', weight_kg: 100, reps: 5, rpe: 8.5 },
      { exercise_id: 'sq', weight_kg: '', reps: 5, rpe: 8 }, // 沒填重量 → 略過
      { exercise_id: '', weight_kg: 50, reps: 5 }, // 沒選動作 → 略過
    ])
    expect(out).toEqual([
      { exercise_id: 'sq', set_no: 1, position: 0, weight_kg: 100, reps: 5, rpe: 8, hr: null },
      { exercise_id: 'bp', set_no: 1, position: 1, weight_kg: 60, reps: 8, rpe: null, hr: null },
      { exercise_id: 'sq', set_no: 2, position: 2, weight_kg: 100, reps: 5, rpe: 8.5, hr: null },
    ])
  })
})

describe('依動作分組', () => {
  it('保持動作第一次出現的順序', () => {
    const g = groupSets([
      { exercise_id: 'bp', set_no: 1 }, { exercise_id: 'sq', set_no: 1 }, { exercise_id: 'bp', set_no: 2 },
    ])
    expect(g.map((x) => x.exercise_id)).toEqual(['bp', 'sq'])
    expect(g[0].sets.map((s) => s.set_no)).toEqual([1, 2])
  })
})
