import test from 'node:test';
import assert from 'node:assert/strict';
import {nextPollAt} from '../lib/pollSchedule.js';
test('hourly boundaries use :01 across exact boundaries, midnight, and retries',()=>{
    for(const [now,expected] of [
        ['2026-10-07T12:00:59Z','2026-10-07T12:01:00Z'],
        ['2026-10-07T12:01:00Z','2026-10-07T13:01:00Z'],
        ['2026-10-07T12:09:00Z','2026-10-07T13:01:00Z'],
        ['2026-10-07T23:59:00Z','2026-10-08T00:01:00Z'],
    ]) assert.equal(nextPollAt(60,Date.parse(now),1).toISOString(),new Date(expected).toISOString());
    for(const offset of [-1,60,1.5,'bad'])assert.throws(()=>nextPollAt(60,Date.now(),offset));
    assert.equal(nextPollAt(30,Date.parse('2026-10-07T12:01:00Z')).toISOString(),'2026-10-07T12:30:00.000Z');
});
