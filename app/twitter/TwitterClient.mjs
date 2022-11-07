import { TwitterApi } from "twitter-api-v2";
import Tweet from "./Tweet.mjs";

export default class TwitterClient
{
  /** @var {TwitterApi|null} */
  #twitter;
  /** @var {MastodonApi|null} */
  #mastodon;

  constructor() {
    this.#twitter = process.env.TWITTER_CONSUMER_KEY ? new TwitterApi({
      appKey: process.env.TWITTER_CONSUMER_KEY,
      appSecret: process.env.TWITTER_CONSUMER_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN_KEY,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    }) : null;

    this.#mastodon = process.env.MASTODON_TOKEN ?
      new MastodonApi(process.env.MASTODON_HOST, process.env.MASTODON_TOKEN) : null;
  }

  /**
   * @param {Tweet} tweet
   */
  async send(tweet) {
    await this.sendTweet(tweet);
    await this.sendToot(tweet);
  }

  async sendTweet(tweet) {
    if (!this.#twitter) {
      console.warn('Not posting tweet due to missing token', tweet);
      return;
    }

    // Upload images
    let mediaIds = await Promise.all(
      tweet.media.map(async m => {
        let id = await this.#twitter.v1.uploadMedia(m.file, { mimeType: m.type });

        if (m.altText) {
          await this.#twitter.v1.createMediaMetadata(id, { alt_text: { text: m.altText } });
        }

        return id;
      }),
    );

    // Send tweet
    await this.#twitter.v1.tweet(tweet.status, { media_ids: mediaIds });
  }

  async sendToot(tweet) {
    if (!this.#mastodon) {
      console.warn('Not posting Mastodon status due to missing token', tweet);
    }

    const mediaIds = await Promise.all(tweet.media.map(async media => {
      const data = await this.#mastodon.uploadMedia(media.file, media.altText);
      return data.id;
    }));

    await this.#mastodon.postStatus({
      status: tweet.status,
      media_ids: mediaIds,
      // public, unlisted, private (followers), direct (mentions)
      visibility: 'public',
      language: 'en',
    });
  }
}

class MastodonApi {
  api_url;
  #token;

  /**
   * @param {string} token
   */
  constructor(hostname, token) {
    this.api_url = new URL('https://' + hostname + '/api/v1/');
    this.#token = token;
  }

  async fetch(method, url, body) {
    const headers = new Headers({
        'Authorization': 'Bearer ' + this.#token,
    });

    if (body && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const response = await fetch(new URL(url, this.api_url), {
      method: method || 'GET',
      headers,
      body,
    });

    if (response.status !== 200) {
      console.error('Unexpected response from Mastodon API', response.status, await response.text());
      throw new Error('Unexpected response from Mastodon API');
    }

    const data = await response.json();
    return data;
  }

  async postStatus(data) {
    const result = await this.fetch('POST', 'statuses', data);
    console.info('Posted status', result.id, result.uri);
    return data;
  }

  async uploadMedia(file, description) {
    const data = new FormData();

    data.append('file', new Blob([file]), 'media.png');
    data.append('description', description);

    const result = await this.fetch('POST', 'media', data);
    console.info('Uploaded media', result.id);
    return result;
  }
}
