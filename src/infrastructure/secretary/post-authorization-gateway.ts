import type { PostAuthorizationGateway } from '../../domain/repositories/post-authorization-gateway.ts';

export class SecretaryPostAuthorizationGateway implements PostAuthorizationGateway {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }
  async prepareWelcome(input: {
    actorId: string;
    accessToken: string;
    tokenType: string;
    timezone: string;
    webhookUrl: string;
  }): Promise<{ documentUrl?: string }> {
    const authorization = `${input.tokenType} ${input.accessToken}`;
    const registration = await fetch(`${this.host}/webhook/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify({
        webhookUrl: input.webhookUrl,
      }),
    });
    if (!registration.ok) {
      throw new Error('[token] webhook registration failed');
    }
    const inbox = await fetch(`${input.actorId}/inbox`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/activity+json',
        'Authorization': authorization,
        'Timezone': input.timezone,
      },
    });
    if (!inbox.ok) {
      throw new Error('Unknown server error');
    }
    const result = await inbox.json();
    const [item] =
      result.orderedItems?.filter((value) => {
        return value.actor === `${this.host}/actor`;
      }) ?? [];
    if (!item) {
      return {};
    }
    const object = await fetch(item.object, {
      headers: {
        Accept: 'application/activity+json',
        Authorization: authorization,
      },
    });
    if (!object.ok) {
      throw new Error('Unknown server error');
    }
    const { attachment } = await object.json();
    return {
      documentUrl: attachment?.[0],
    };
  }
}
