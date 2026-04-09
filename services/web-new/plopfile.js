export default function (plop) {
    plop.setGenerator('element', {
        description: 'Créer un élément React (component, page, layout, hook)',
        prompts: [
            {
                type: 'list',
                name: 'elementType',
                message: 'Quel type souhaitez-vous créer ?',
                choices: ['component', 'page', 'layout', 'hook'],
            },
            {
                type: 'input',
                name: 'name',
                message: "Nom de l'élément ?",
            },
            {
                type: 'confirm',
                name: 'isStyled',
                message: 'Ajouter un composant stylé ?',
                when: (answers) => answers.elementType === 'component',
                default: true,
            },
            {
                type: 'confirm',
                name: 'withProps',
                message: 'Ajouter une interface de props ?',
                when: (answers) =>
                    answers.elementType === 'component' && !answers.isStyled,
                default: true,
            },
            {
                type: 'input',
                name: 'category',
                message: "Quelle est la catégorie de l'élément ?",
                when: (answers) =>
                    ['component', 'layout'].includes(answers.elementType),
            },
            {
                type: 'input',
                name: 'urlPath',
                message: "Quel est le chemin de l'URL ?",
                when: (answers) => answers.elementType === 'page',
            },
            {
                type: 'input',
                name: 'type',
                message: 'Type du state du hook ? (ex: string, number, etc.)',
                when: (answers) => answers.elementType === 'hook',
            },
            {
                type: 'input',
                name: 'defaultValue',
                message: 'Valeur par défaut du state du hook ?',
                when: (answers) => answers.elementType === 'hook',
            },
        ],
        actions: function (data) {
            if (data.elementType === 'hook') {
                return [
                    {
                        type: 'add',
                        path: 'src/hooks/use-{{kebabCase name}}.tsx',
                        templateFile: 'src/templates/hook.hbs',
                    },
                ];
            }

            // 📁 Dossier de destination dynamique selon le type
            const basePath = `src/${data?.elementType}s${
                ['component', 'layout'].includes(data?.elementType)
                    ? `/{{kebabCase category}}`
                    : ''
            }/{{kebabCase name}}`;

            const actions = [
                {
                    type: 'add',
                    path: `${basePath}/{{camelCase elementType}}.tsx`,
                    templateFile: 'src/templates/component.hbs',
                },
                {
                    type: 'add',
                    path: `${basePath}/{{camelCase elementType}}.stories.tsx`,
                    templateFile: 'src/templates/storybook.hbs',
                },
            ];

            if (data.elementType === 'page') {
                actions.push({
                    type: 'modify',
                    path: 'src/App.tsx',
                    pattern: /(\/\/\s*PLOP_IMPORT)/g,
                    template: `import {{pascalCase name}}Page from './pages/{{kebabCase name}}/page';\n$1`,
                });

                actions.push({
                    type: 'modify',
                    path: 'src/App.tsx',
                    pattern: /(\{\s*\/\*\s*PLOP_ROUTE\s*\*\/\s*\})/g,
                    template: `                <Route path="{{urlPath}}" element={<{{pascalCase name}}Page />} />\n$1`,
                });
            }

            return actions;
        },
    });

    plop.setHelper('eq', (a, b) => a === b);
}
