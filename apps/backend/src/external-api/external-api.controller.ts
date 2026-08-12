import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ExternalApiKeyGuard } from '../api-keys/external-api-key.guard';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { SessionsService } from '../sessions/sessions.service';
import { ContentLabelsService } from '../content-labels/content-labels.service';
import { ContentCategoriesService } from '../content-categories/content-categories.service';
import { MenuService } from '../menu/menu.service';

/** Surface en lecture seule pensée pour un consommateur externe (site web,
 * bot Discord, la tablette client `/tablet-menu`, etc.) — authentifiée par
 * clé API dédiée (`ApiKeysModule`), pas par le JWT du dashboard. Renvoie
 * les mêmes données que le dashboard admin, juste sous un chemin et une
 * auth séparés pour ne jamais coupler un client externe à la session JWT
 * d'un utilisateur du dashboard. */
@Controller('external/v1')
@UseGuards(ExternalApiKeyGuard)
export class ExternalApiController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly sessionsService: SessionsService,
    private readonly contentLabelsService: ContentLabelsService,
    private readonly contentCategoriesService: ContentCategoriesService,
    private readonly menuService: MenuService,
  ) {}

  @Get('leaderboard')
  getLeaderboard() {
    return this.leaderboardService.getLeaderboard();
  }

  @Get('sessions')
  getSessions(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.sessionsService.findHistory({ limit: parsedLimit, cursor });
  }

  @Get('sessions/:id')
  getSessionDetail(@Param('id') id: string) {
    return this.sessionsService.getDetail(id);
  }

  // Consommé par la page tablette publique (/tablet-menu) — catalogue
  // voitures/circuits (voir ContentLabelsService.getCatalog()) et carte
  // resto/bar (voir MenuService.listGrouped()).
  @Get('content')
  getContent() {
    return this.contentLabelsService.getCatalog();
  }

  // Liste des catégories configurées (/content-categories) — sert à
  // /tablet-menu à générer ses tuiles de filtre voitures/circuits sans
  // liste figée dans le code (voir ContentCategoriesService).
  @Get('categories')
  getCategories() {
    return this.contentCategoriesService.listGroupedByType();
  }

  @Get('menu')
  getMenu() {
    return this.menuService.listGrouped();
  }
}
