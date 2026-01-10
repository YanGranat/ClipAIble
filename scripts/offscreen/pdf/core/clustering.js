// @ts-check
// Core clustering algorithm - ported from pdfplumber
// This is a proven algorithm from Python pdfplumber library

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';

/**
 * Cluster objects by a key value with tolerance
 * Ported from pdfplumber/utils/clustering.py:cluster_objects()
 * 
 * ORIGINAL ALGORITHM: Compares with last item in cluster (not mean)
 * This creates a "chain" where each new item is compared only with the previous one
 * 
 * @param {Array} objects - Array of objects to cluster
 * @param {import('../../../types.js').KeyExtractorFunction} keyFn - Function to extract key value from object (e.g., item => item.y)
 * @param {number} tolerance - Maximum difference for objects to be in same cluster
 * @param {string} context - Context for logging
 * @returns {Array<Array>} Array of clusters (each cluster is an array of objects)
 */
export function clusterObjects(objects, keyFn, tolerance, context = 'clustering') {
  if (objects.length === 0) {
    log(`[PDF v3] clusterObjects: ${context} - No objects to cluster`);
    return [];
  }
  
  log(`[PDF v3] clusterObjects: ${context} - Starting clustering`, {
    totalObjects: objects.length,
    tolerance: tolerance.toFixed(2)
  });
  
  // Sort objects by key value
  const sortedObjects = [...objects].sort((a, b) => keyFn(a) - keyFn(b));
  
  const clusters = [];
  let currentCluster = [sortedObjects[0]];
  
  for (let i = 1; i < sortedObjects.length; i++) {
    const obj = sortedObjects[i];
    const lastInCluster = currentCluster[currentCluster.length - 1];
    
    // ORIGINAL pdfplumber algorithm: Compare with last item in cluster
    // This creates a "chain" where each new item is compared only with the previous one
    const keyDiff = Math.abs(keyFn(obj) - keyFn(lastInCluster));
    
    if (keyDiff <= tolerance) {
      currentCluster.push(obj);
    } else {
      clusters.push(currentCluster);
      currentCluster = [obj];
    }
  }
  
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }
  
  log(`[PDF v3] clusterObjects: ${context} - Clustering complete`, {
    totalClusters: clusters.length,
    avgClusterSize: (objects.length / clusters.length).toFixed(2)
  });
  
  return clusters;
}

