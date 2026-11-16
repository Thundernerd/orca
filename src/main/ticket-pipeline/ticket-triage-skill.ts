import type { Repo } from '../../shared/repository/repo-types'
import { discoverSkills } from '../skills/discovery/skill-native-discovery'

/** The Claude skill that triages tickets in this project (user, repo or plugin), or null. */
export async function findTicketTriageSkill(repo: Repo): Promise<string | null> {
  const { skills } = await discoverSkills({ repos: [repo], cwd: repo.path }).catch(() => ({
    skills: []
  }))
  const triage = skills
    .filter((skill) => skill.providers.includes('claude') && /triage/i.test(skill.name))
    // An exact `triage` wins over e.g. `triage-bugs`; the rest by name, so the pick is stable.
    .sort(
      (a, b) =>
        Number(b.name === 'triage') - Number(a.name === 'triage') || a.name.localeCompare(b.name)
    )
  return triage[0]?.name ?? null
}
