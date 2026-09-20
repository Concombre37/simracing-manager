import { Injectable } from '@nestjs/common';
import { StationsService } from '../stations/stations.service';
import { AgentGateway } from '../agent/agent.gateway';
import { PowerManagementService } from '../power-management/power-management.service';
import { StationRole } from '@simracing/shared';

export interface BulkActionResult {
  succeeded: string[];
  failed: { stationId: string; error: string }[];
}

/** Page /pods-control (QOL) : chaque bouton agit sur une sélection de
 * stations d'un coup, en réutilisant tel quel le chemin déjà emprunté par
 * l'action équivalente à l'unité (PowerManagementService, AgentGateway) —
 * aucune nouvelle logique de commande, juste l'orchestration groupée. Une
 * station en échec ne bloque jamais les autres. Les actions sont limitées à
 * quelques postes à la fois afin d'éviter un pic de connexions Prisma et de
 * reconnexions WebSocket lorsque toute la flotte redémarre ensemble. */
@Injectable()
export class BulkActionsService {
  constructor(
    private readonly stationsService: StationsService,
    private readonly agentGateway: AgentGateway,
    private readonly powerManagementService: PowerManagementService,
  ) {}

  async wake(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodDbId(id, (podId) => this.powerManagementService.wake(podId)),
    );
  }

  async shutdown(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodDbId(id, (podId) =>
        this.powerManagementService.shutdown(podId),
      ),
    );
  }

  async restart(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodDbId(id, (podId) =>
        this.powerManagementService.restart(podId),
      ),
    );
  }

  async blankingHide(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodBusinessId(id, (stationId) =>
        this.agentGateway.emitBlankingHide(stationId),
      ),
    );
  }

  async blankingShow(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodBusinessId(id, (stationId) =>
        this.agentGateway.emitBlankingShow(stationId),
      ),
    );
  }

  async updateAgent(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withUpdateBusinessId(id, (stationId) => this.agentGateway.emitUpdateAgent(stationId)),
    );
  }

  /** Updates are safe for simulator and spectator agents; admin stations stay excluded. */
  private async withUpdateBusinessId(id: string, fn: (stationId: string) => Promise<void>) {
    const station = await this.stationsService.findOne(id);
    if (station.role === StationRole.ADMIN) {
      throw new Error(`Le poste ${station.name} est un administrateur et a été exclu de l'action.`);
    }
    await fn(station.stationId);
  }

  async syncContent(stationIds: string[]): Promise<BulkActionResult> {
    return this.run(stationIds, (id) =>
      this.withPodBusinessId(id, (stationId) =>
        this.agentGateway.emitContentSync(stationId),
      ),
    );
  }

  private async withPodDbId(
    id: string,
    fn: (id: string) => Promise<unknown>,
  ): Promise<void> {
    const station = await this.requirePod(id);
    await fn(station.id);
  }

  private async withPodBusinessId(
    id: string,
    fn: (stationId: string) => Promise<void>,
  ): Promise<void> {
    const station = await this.requirePod(id);
    await fn(station.stationId);
  }

  private async requirePod(id: string) {
    const station = await this.stationsService.findOne(id);
    if (station.role !== StationRole.SIMULATOR) {
      throw new Error(
        `Le poste ${station.name} est un administrateur et a été exclu de l'action.`,
      );
    }
    return station;
  }

  private async run(
    stationIds: string[],
    fn: (id: string) => Promise<unknown>,
  ): Promise<BulkActionResult> {
    // Un clic répété ne doit pas doubler les commandes. Quatre workers
    // maintiennent un débit suffisant sans saturer l'API ou la base.
    const ids = [...new Set(stationIds)];
    const results: PromiseSettledResult<unknown>[] = new Array(ids.length);
    let next = 0;
    const worker = async () => {
      while (true) {
        const index = next++;
        if (index >= ids.length) return;
        try {
          results[index] = { status: 'fulfilled', value: await fn(ids[index]) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, ids.length) }, () => worker()),
    );
    const succeeded: string[] = [];
    const failed: { stationId: string; error: string }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded.push(ids[index]);
      } else {
        failed.push({
          stationId: ids[index],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });

    return { succeeded, failed };
  }
}
