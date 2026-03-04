import type { ProductBrief } from '../types.js';
import { ResearchStateManager } from '../state/research-state.js';
import type { StatePersistence } from '../state/state-persistence.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { audit } from '../../../shared/audit.js';

export async function prcStart(
  persistence: StatePersistence,
  projectPath: string,
  projectName: string,
  brief: string,
): Promise<string> {
  // Check if project already exists
  if (await persistence.exists(projectPath)) {
    return `A research project already exists here. Check the current progress or start a new project in a different location.`;
  }

  // Create directory structure
  await persistence.createDirectories(projectPath);

  // Create product brief
  const productBrief: ProductBrief = {
    name: projectName,
    description: brief.split('\n\n')[0].slice(0, 300),
    rawInput: brief,
    timestamp: new Date().toISOString(),
  };

  // Save brief as markdown
  const briefContent = `# Product Brief: ${projectName}\n\n**Created:** ${productBrief.timestamp}\n\n## Description\n\n${productBrief.description}\n\n## Full Input\n\n${brief}\n`;
  await persistence.writeArtifact(projectPath, 'brief.md', briefContent);

  // Initialize state
  const stateManager = ResearchStateManager.create(projectPath, projectName, productBrief);
  await persistence.save(stateManager.getState());

  // Set project path for token tracking
  tokenTracker.setProjectPath(projectPath);
  audit('project.create', 'pre-rc', projectPath, { projectName });

  return `Project initialized. I've set up the research workspace for "${projectName}".

Your product brief has been saved. Next, I'll analyze the complexity of your idea to determine which research specialists to activate.`;
}
