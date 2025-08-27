# Contributing to idun-agent-platform

First off, thank you for considering contributing to idun-agent-platform! It's people like you that make open source such a great community.

## Where do I go from here?

If you've noticed a bug or have a question, [search the issue tracker](https://github.com/geoffreyharrazi/idun-agent-platform/issues) to see if someone else has already reported the issue. If not, feel free to [open a new issue](https://github.com/geoffreyharrazi/idun-agent-platform/issues/new).

## Fork & create a branch

If you want to contribute with code, please fork the repository and create a new branch from `main`. A good branch name would be `fix/my-fix` or `feat/my-feature`.

## Getting started

After cloning your fork, you can set up your local environment using Poetry:

```bash
poetry install
```

This will install all the dependencies needed for development and testing.

## Making Changes

*   Write clean, maintainable code.
*   Ensure your code is well-formatted using Black and isort. You can run them with:
    ```bash
    poetry run black .
    poetry run isort .
    ```
*   Make sure your code passes linting checks with Flake8:
    ```bash
    poetry run flake8
    ```
*   Write tests for your changes. We use pytest for testing.
*   Ensure all tests pass:
    ```bash
    poetry run pytest
    ```
*   Add a clear and concise commit message.
*   Update the `README.md` and any other relevant documentation if you are adding new features or changing existing ones.

## Submitting your contribution

Once your changes are ready, submit a pull request to the `main` branch of the original repository. Provide a clear description of the changes and why they are needed.

## Code of Conduct

By contributing to this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

If you have any questions, feel free to ask by opening an issue.
