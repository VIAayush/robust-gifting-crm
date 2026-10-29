// Removes every ZZ-QA test fixture left behind by the live database scripts or by manual browser testing.
//   node --env-file=.env scripts/db-tests/_sweep.mjs
import { serviceClient, sweepQaFixtures } from './_fixtures.mjs'

const problems = await sweepQaFixtures(serviceClient(), { all: true })
if (problems.length) {
  console.error('Problems:\n- ' + problems.join('\n- '))
  process.exitCode = 1
} else {
  console.log('ZZ-QA fixtures removed (or none were present).')
}
