import { mergeServersWithOverrides } from '../mcpMerge';
import { McpServerConfig } from '../../types';

const server = (id: string): McpServerConfig => ({
  id,
  name: `Server ${id}`,
  url: `https://${id}.example.com`,
  enabled: true,
  tools: [],
  allowedTools: ['a', 'b'],
  autoApprovedTools: ['a'],
});

describe('mergeServersWithOverrides', () => {
  it('returns global server unchanged when no override exists', () => {
    const globalServers = [server('s1')];
    const result = mergeServersWithOverrides(globalServers, {});

    expect(result).toEqual(globalServers);
    expect(result[0]).toBe(globalServers[0]);
  });

  it('applies enabled and tool-list overrides for matching server ids', () => {
    const globalServers = [server('s1'), server('s2')];
    const result = mergeServersWithOverrides(globalServers, {
      s2: {
        enabled: false,
        allowedTools: ['b'],
        autoApprovedTools: [],
      },
    });

    expect(result[0]).toEqual(globalServers[0]);
    expect(result[1]).toEqual({
      ...globalServers[1],
      enabled: false,
      allowedTools: ['b'],
      autoApprovedTools: [],
    });
  });

  it('falls back to global tool lists when override omits tool arrays', () => {
    const globalServers = [server('s1')];
    const result = mergeServersWithOverrides(globalServers, {
      s1: {
        enabled: false,
      },
    });

    expect(result[0]).toEqual({
      ...globalServers[0],
      enabled: false,
      allowedTools: ['a', 'b'],
      autoApprovedTools: ['a'],
    });
  });
});
