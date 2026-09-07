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
 * station en échec ne bloque jamais les autres (Promise.allSettled). */
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
      this.withPodBusinessId(id, (stationId) =>
        this.agentGateway.emitUpdateAgent(stationId),
      ),
    );
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
    const results = await Promise.allSettled(stationIds.map((id) => fn(id)));
    const succeeded: string[] = [];
    const failed: { stationId: string; error: string }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded.push(stationIds[index]);
      } else {
        failed.push({
          stationId: stationIds[index],
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
