import { test, expect } from 'claude-code/testing'

import { barCells, cpuPercent, levelColor, parseCpu, parseDisk, parseMem } from './metrics'

test('test_should_compute_cpu_percent_when_two_samples_differ', () => {
  const a = parseCpu('cpu  100 0 100 800 0 0 0 0\n')!
  const b = parseCpu('cpu  200 0 200 1000 0 0 0 0\n')!
  expect(cpuPercent(a, b)).toBe(50)
})

test('test_should_return_zero_when_cpu_samples_are_identical', () => {
  const a = parseCpu('cpu  1 0 1 8 0 0 0 0\n')!
  expect(cpuPercent(a, a)).toBe(0)
})

test('test_should_use_memavailable_when_parsing_ram', () => {
  const { ram, swap } = parseMem(
    'MemTotal: 1000 kB\nMemAvailable: 400 kB\nSwapTotal: 200 kB\nSwapFree: 150 kB\n',
  )
  expect(ram).toEqual({ used: 600 * 1024, total: 1000 * 1024 })
  expect(swap).toEqual({ used: 50 * 1024, total: 200 * 1024 })
})

test('test_should_return_null_when_meminfo_is_missing', () => {
  expect(parseMem('')).toEqual({ ram: null, swap: null })
  expect(parseCpu('')).toBe(null)
})

test('test_should_pick_green_orange_red_when_crossing_thresholds', () => {
  expect(levelColor(59)).toBe('#3fb950')
  expect(levelColor(60)).toBe('#ff9800')
  expect(levelColor(84)).toBe('#ff9800')
  expect(levelColor(85)).toBe('#f85149')
})

test('test_should_clamp_bar_cells_when_percent_out_of_range', () => {
  expect(barCells(150, 20)).toBe(20)
  expect(barCells(-5, 20)).toBe(0)
  expect(barCells(50, 20)).toBe(10)
})

test('test_should_compute_free_space_when_parsing_df_output', () => {
  const disk = parseDisk('        Usado          Disp.\n  200000000000   50000000000\n')
  expect(disk).toEqual({ used: 200000000000, total: 250000000000 })
})

test('test_should_return_null_when_df_output_is_invalid', () => {
  expect(parseDisk('')).toBe(null)
  expect(parseDisk('erro\n')).toBe(null)
})
