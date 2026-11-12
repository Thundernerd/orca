import type { JiraProject } from '../../../shared/jira/jira-types'
import type { LinearTeam } from '../../../shared/linear/workspace-types'
import type { Repo } from '../../../shared/repo-types'
import type { TicketSourceOption } from '../../../shared/ticket-pipeline/ticket-types'
import { listProjects } from '../../jira/jira-project-queries'
import { listTeams } from '../../linear/teams/linear-team-queries'

function linearOption(team: LinearTeam): TicketSourceOption[] {
  if (!team.workspaceId) {
    return []
  }
  const workspace = team.workspaceName ? `${team.workspaceName} / ` : ''
  return [
    {
      label: `Linear · ${workspace}${team.name} (${team.key})`,
      config: { kind: 'linear', workspaceId: team.workspaceId, teamId: team.id, teamKey: team.key }
    }
  ]
}

function jiraOption(project: JiraProject): TicketSourceOption[] {
  if (!project.siteId) {
    return []
  }
  const site = project.siteName ? `${project.siteName} / ` : ''
  return [
    {
      label: `Jira · ${site}${project.name} (${project.key})`,
      config: {
        kind: 'jira',
        siteId: project.siteId,
        projectId: project.id,
        projectKey: project.key
      }
    }
  ]
}

/** What a project can take its tickets from: the repo-backed defaults, then every connected Linear team and Jira project. */
export async function listTicketSourceOptions(repo: Repo): Promise<TicketSourceOption[]> {
  const [teams, projects] = await Promise.all([
    listTeams('all').catch(() => []),
    listProjects('all').catch(() => [])
  ])
  // The project's default Jira project comes first among the Jira choices.
  const preferred = repo.defaultJiraProject?.key
  const jira = [...projects].sort(
    (a, b) => Number(b.key === preferred) - Number(a.key === preferred)
  )
  return [
    { label: 'Automatic: ticket files, else GitHub issues', config: { kind: 'auto' } },
    { label: 'GitHub issues', config: { kind: 'github-issues' } },
    ...teams.flatMap(linearOption),
    ...jira.flatMap(jiraOption)
  ]
}
