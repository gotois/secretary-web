import type { PostAuthorizationGateway } from '../repositories/post-authorization-gateway.ts';

export class PrepareAuthorizationWelcome {
  gateway: PostAuthorizationGateway;
  constructor(gateway: PostAuthorizationGateway) {
    this.gateway = gateway;
  }
  execute(input: { actorId: string; accessToken: string; tokenType: string; timezone: string; webhookUrl: string }) {
    return this.gateway.prepareWelcome(input);
  }
}
