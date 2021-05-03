'use strict';

const { prop } = require('lodash/fp');
const { createTestBuilder } = require('../../../../test/helpers/builder');
const { createStrapiInstance } = require('../../../../test/helpers/strapi');
const { createAuthRequest } = require('../../../../test/helpers/request');

const builder = createTestBuilder();
let strapi;
let rq;
const localeIds = [];
const recipes = {};
const model = 'recipe';

const recipeModel = {
  attributes: {
    name: {
      type: 'string',
    },
  },
  pluginOptions: {
    i18n: {
      localized: true,
    },
  },
  connection: 'default',
  name: 'recipe',
  description: '',
  collectionName: '',
};

describe('Create related entries in different locales', () => {
  beforeAll(async () => {
    await builder.addContentType(recipeModel).build();

    strapi = await createStrapiInstance();
    rq = await createAuthRequest({ strapi });

    for (const locale of [
      { code: 'fr', name: 'French' },
      { code: 'asa', name: 'Asu' },
    ]) {
      const createdLocale = await strapi.query('locale', 'i18n').create(locale);
      localeIds.push(createdLocale.id);
    }
    const recipe = await strapi.entityService.create(
      { data: { name: 'Onion soup', locale: 'asa' } },
      { model }
    );
    recipes.asa = recipe;
  });

  afterAll(async () => {
    await strapi.query('locale', 'i18n').delete({ id_in: localeIds });
    await strapi.query('recipe').delete();
    await strapi.destroy();
    await builder.cleanup();
  });

  describe('Collection-Type', () => {
    test('Can create a related entry (1 existing)', async () => {
      const res = await rq({
        method: 'POST',
        url: `/recipes/${recipes.asa.id}/localizations`,
        body: { name: 'Onion soup', locale: 'fr' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Onion soup',
        locale: 'fr',
        localizations: [{ locale: 'asa' }],
      });
      recipes.fr = res.body;
    });

    test('Can create a related entry (2 existing)', async () => {
      const { status, body } = await rq({
        method: 'POST',
        url: `/recipes/${recipes.fr.id}/localizations`,
        body: { name: 'Onion soup', locale: 'en' },
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({ name: 'Onion soup', locale: 'en' });
      expect(body.localizations.map(prop('locale')).sort()).toEqual(['asa', 'fr']);
      recipes.en = body;
    });

    test.each([
      ['en', ['asa', 'fr']],
      ['fr', ['asa', 'en']],
      ['asa', ['en', 'fr']],
    ])('Localizations is correctly set in locale "%s"', async (locale, relatedlocales) => {
      const { body } = await rq({ method: 'GET', url: `/recipes/${recipes[locale].id}` });
      expect(body.localizations.map(prop('locale')).sort()).toEqual(relatedlocales);
    });

    test('Cannot create an entry without locale being specified', async () => {
      const res = await rq({
        method: 'POST',
        url: `/recipes/${recipes.asa.id}/localizations`,
        body: { name: 'Onion soup' },
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: 'Bad Request',
        message: 'locale.missing',
        statusCode: 400,
      });
    });

    test.each([['en'], ['fr']])('Cannot create an entry already existing "%s"', async locale => {
      const res = await rq({
        method: 'POST',
        url: `/recipes/${recipes.asa.id}/localizations`,
        body: { name: 'Onion soup', locale },
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: 'Bad Request',
        message: 'locale.already.used',
        statusCode: 400,
      });
    });
  });
});
