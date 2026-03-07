import fs from 'node:fs';
import path from 'node:path';

/** Load PRD content from a project for agent context */
export async function loadPrdContext(projectPath: string): Promise<string> {
  const prdsDir = path.join(projectPath, 'rc-method', 'prds');

  try {
    if (!fs.existsSync(prdsDir)) {
      const preRcDir = path.join(projectPath, 'pre-rc-research');
      if (fs.existsSync(preRcDir)) {
        const files = fs.readdirSync(preRcDir).filter((f: string) => f.endsWith('.md') && f.includes('prd'));
        if (files.length > 0) {
          return fs.readFileSync(path.join(preRcDir, files[0]), 'utf-8');
        }
      }
      return 'No PRD found. Will work from project description only.';
    }

    const files = fs.readdirSync(prdsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => fs.readFileSync(path.join(prdsDir, f), 'utf-8')).join('\n\n---\n\n');
  } catch {
    return 'Could not load PRD files.';
  }
}

/** Load ICP and competitor data from Pre-RC research */
export async function loadResearchContext(projectPath: string): Promise<{
  icpData: string | undefined;
  competitorData: string | undefined;
}> {
  const researchDir = path.join(projectPath, 'pre-rc-research');

  let icpData: string | undefined;
  let competitorData: string | undefined;

  try {
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir);
      const icpFile = files.find(
        (f: string) => f.includes('icp') || f.includes('persona') || f.includes('user-research'),
      );
      if (icpFile) {
        icpData = fs.readFileSync(path.join(researchDir, icpFile), 'utf-8');
      }
      const compFile = files.find(
        (f: string) => f.includes('competitor') || f.includes('market') || f.includes('landscape'),
      );
      if (compFile) {
        competitorData = fs.readFileSync(path.join(researchDir, compFile), 'utf-8');
      }
    }
  } catch {
    // Non-fatal
  }

  return { icpData, competitorData };
}
