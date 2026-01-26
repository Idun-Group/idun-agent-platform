# Contributing to Idun Agent Platform

First off, thank you for considering contributing to idun-agent-platform! It's people like you who make open source such a great community.

## Where do I go from here?

If you've noticed a bug or have a question, [search the issue tracker](https://github.com/Idun-Group/idun-agent-platform/issues) to see if someone else has already reported the issue. If not, feel free to [open a new issue](https://github.com/Idun-Group/idun-agent-platform/issues/new).

## Fork & create a branch

If you want to contribute code, please fork the repository and create a new branch from `main`. A good branch name would be `fix/my-fix` or `feat/my-feature`.

## Getting started

This repo requires **Python 3.12+**.

After cloning your fork, set up your local environment using `uv` (including dev tools like `pytest` and `pre-commit`):

```bash
uv sync --all-groups
```

This will install all the dependencies needed for development and testing.

## Making changes

- Write clean, maintainable code.
- Run the pre-commit checks:

```bash
make precommit
```

- Run the test suite:

```bash
make test
```

- Write clear and concise commit messages.
- Update the `README.md` and any other relevant documentation in the `/docs` folder if you are adding new features or changing existing ones.

## Submitting your contribution

Once your changes are complete, submit a pull request to the `main` branch of the original repository. Provide a clear description of the changes and why they are needed.

## Code of Conduct

By contributing to this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

If you have any questions, feel free to ask by opening an issue.
