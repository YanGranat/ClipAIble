// @ts-check
// Script to apply generated extraction code to automatic.js
// Run: node scripts/apply-extraction-build.js

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GENERATED_FILE = path.join(__dirname, '..', 'dist', 'extraction-automatic-generated.js');
const TARGET_FILE = path.join(__dirname, 'extraction', 'automatic.js');

async function apply() {
  try {
    console.log('📋 Applying generated extraction code...');
    
    // Check if generated file exists
    try {
      await fs.access(GENERATED_FILE);
    } catch {
      console.error('❌ Generated file not found. Run "node build-extraction.js" first.');
      process.exit(1);
    }
    
    // Read generated file
    const generatedCode = await fs.readFile(GENERATED_FILE, 'utf-8');
    
    // Write generated code to target
    await fs.writeFile(TARGET_FILE, generatedCode, 'utf-8');
    
    console.log(`✅ Applied to: ${TARGET_FILE}`);
    console.log(`📊 Size: ${(generatedCode.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Apply failed:', error);
    process.exit(1);
  }
}

apply();
