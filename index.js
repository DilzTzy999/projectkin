require("dotenv").config();

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { Octokit } = require("octokit");

// =====================================================
// CONFIG
// =====================================================

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const WORKFLOW = process.env.GITHUB_WORKFLOW || "build-apk.yml";
const TOKEN = process.env.GITHUB_TOKEN;

// =====================================================
// DIRECTORIES
// =====================================================

const REPO_DIR = process.cwd();

const INPUT_DIR = path.join(
    REPO_DIR,
    "input"
);

const UPLOAD_DIR = path.join(
    REPO_DIR,
    "uploads"
);

const OUTPUT_DIR = path.join(
    REPO_DIR,
    "output"
);

// =====================================================
// CHECK ENV
// =====================================================

if (!OWNER || !REPO || !TOKEN) {

    console.error(`
╔════════════════════════════════════════════╗
║              CONFIGURATION ERROR           ║
╚════════════════════════════════════════════╝

❌ Konfigurasi .env belum lengkap.

Pastikan ada:

GITHUB_TOKEN=github_pat_xxxxxxxxx
GITHUB_OWNER=username
GITHUB_REPO=repository
GITHUB_BRANCH=main
GITHUB_WORKFLOW=build-apk.yml

`);

    process.exit(1);
}

// =====================================================
// GITHUB API
// =====================================================

const octokit = new Octokit({
    auth: TOKEN
});

// =====================================================
// CREATE DIRECTORIES
// =====================================================

fs.mkdirSync(
    INPUT_DIR,
    {
        recursive: true
    }
);

fs.mkdirSync(
    UPLOAD_DIR,
    {
        recursive: true
    }
);

fs.mkdirSync(
    OUTPUT_DIR,
    {
        recursive: true
    }
);

// =====================================================
// UTILS
// =====================================================

function sleep(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}

// =====================================================
// ASK INPUT
// =====================================================

function ask(question) {

    const rl =
        readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

    return new Promise(resolve => {

        rl.question(
            question,
            answer => {

                rl.close();

                resolve(
                    answer.trim()
                );
            }
        );
    });
}

// =====================================================
// FORMAT BYTES
// =====================================================

function formatBytes(bytes) {

    if (bytes < 1024) {

        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {

        return `${(
            bytes / 1024
        ).toFixed(2)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {

        return `${(
            bytes /
            1024 /
            1024
        ).toFixed(2)} MB`;
    }

    return `${(
        bytes /
        1024 /
        1024 /
        1024
    ).toFixed(2)} GB`;
}

// =====================================================
// RUN GIT
// =====================================================

function runGit(args) {

    console.log(
        `$ git ${args.join(" ")}`
    );

    return execFileSync(
        "git",
        args,
        {
            cwd: REPO_DIR,
            encoding: "utf8",
            stdio: [
                "inherit",
                "pipe",
                "pipe"
            ]
        }
    ).trim();
}

// =====================================================
// CHECK GIT REPOSITORY
// =====================================================

function checkGitRepository() {

    try {

        runGit([
            "rev-parse",
            "--is-inside-work-tree"
        ]);

    } catch {

        throw new Error(
            "Folder ini bukan Git repository. Jalankan git clone terlebih dahulu."
        );
    }
}

// =====================================================
// CHECK BRANCH
// =====================================================

function checkBranch() {

    const currentBranch =
        runGit([
            "branch",
            "--show-current"
        ]);

    console.log(
        `      Branch lokal: ${currentBranch}`
    );

    if (currentBranch !== BRANCH) {

        throw new Error(
            `Branch saat ini "${currentBranch}", ` +
            `tetapi konfigurasi menggunakan "${BRANCH}".`
        );
    }
}

// =====================================================
// GET ZIP FILES
// =====================================================

function getZipFiles(directory) {

    if (!fs.existsSync(directory)) {

        return [];
    }

    const entries =
        fs.readdirSync(
            directory,
            {
                withFileTypes: true
            }
        );

    return entries
        .filter(entry =>
            entry.isFile() &&
            entry.name
                .toLowerCase()
                .endsWith(".zip")
        )
        .map(entry =>
            path.join(
                directory,
                entry.name
            )
        );
}

// =====================================================
// NORMALIZE PATH
// =====================================================

function normalizePath(inputPath) {

    return path.resolve(
        inputPath.replace(
            /^["']|["']$/g,
            ""
        )
    );
}

// =====================================================
// ASK VALID ZIP PATH
// =====================================================

async function askZipPath() {

    while (true) {

        let zipPath =
            await ask(
                "\nMasukkan path ZIP project: "
            );

        if (!zipPath) {

            console.log(
                "\n❌ Path tidak boleh kosong."
            );

            continue;
        }

        zipPath =
            normalizePath(
                zipPath
            );

        if (!fs.existsSync(zipPath)) {

            console.log(`
❌ File tidak ditemukan:

${zipPath}
`);

            continue;
        }

        const stat =
            fs.statSync(zipPath);

        if (!stat.isFile()) {

            console.log(
                "\n❌ Path tersebut bukan file."
            );

            continue;
        }

        if (
            !zipPath
                .toLowerCase()
                .endsWith(".zip")
        ) {

            console.log(
                "\n❌ File harus berformat .zip."
            );

            continue;
        }

        console.log(
            `\n✓ ZIP ditemukan: ${zipPath}`
        );

        return zipPath;
    }
}

// =====================================================
// SELECT ZIP FROM DIRECTORY
// =====================================================

async function selectZipFromDirectory(
    directory
) {

    const zipFiles =
        getZipFiles(
            directory
        );

    if (zipFiles.length === 0) {

        return null;
    }

    console.log(
        `\n📦 Ditemukan ${zipFiles.length} file ZIP:\n`
    );

    zipFiles.forEach(
        (file, index) => {

            const stat =
                fs.statSync(file);

            console.log(
                `  ${index + 1}. ` +
                `${path.basename(file)}` +
                ` (${formatBytes(stat.size)})`
            );
        }
    );

    console.log(
        `\n  ${zipFiles.length + 1}. Masukkan path manual`
    );

    while (true) {

        const answer =
            await ask(
                "\nPilih file: "
            );

        const number =
            Number(answer);

        if (
            Number.isInteger(number) &&
            number >= 1 &&
            number <= zipFiles.length
        ) {

            const selected =
                zipFiles[number - 1];

            console.log(
                `\n✓ ZIP dipilih: ${selected}`
            );

            return selected;
        }

        if (
            number ===
            zipFiles.length + 1
        ) {

            return await askZipPath();
        }

        console.log(
            "\n❌ Pilihan tidak valid."
        );
    }
}

// =====================================================
// SELECT ZIP
// =====================================================

async function selectZip() {

    console.log(`
╔════════════════════════════════════════════╗
║              INPUT ZIP PROJECT             ║
╚════════════════════════════════════════════╝

Folder input:

${INPUT_DIR}
`);

    // =================================================
    // CHECK INPUT DIRECTORY
    // =================================================

    let zipFiles =
        getZipFiles(
            INPUT_DIR
        );

    // =================================================
    // ZIP FOUND IN INPUT
    // =================================================

    if (zipFiles.length > 0) {

        console.log(
            `📦 Ditemukan ${zipFiles.length} ZIP di folder input:\n`
        );

        zipFiles.forEach(
            (file, index) => {

                const stat =
                    fs.statSync(file);

                console.log(
                    `  ${index + 1}. ` +
                    `${path.basename(file)}` +
                    ` (${formatBytes(stat.size)})`
                );
            }
        );

        console.log(
            `\n  ${zipFiles.length + 1}. Masukkan path manual`
        );

        while (true) {

            const answer =
                await ask(
                    "\nPilih file: "
                );

            const number =
                Number(answer);

            if (
                Number.isInteger(number) &&
                number >= 1 &&
                number <= zipFiles.length
            ) {

                const selected =
                    zipFiles[number - 1];

                console.log(
                    `\n✓ ZIP dipilih: ${selected}`
                );

                return selected;
            }

            if (
                number ===
                zipFiles.length + 1
            ) {

                return await askZipPath();
            }

            console.log(
                "\n❌ Pilihan tidak valid."
            );
        }
    }

    // =================================================
    // NO ZIP IN INPUT
    // =================================================

    console.log(
        "⚠ Tidak ada file ZIP di folder input."
    );

    console.log(`
Pilih metode input:

  1. Masukkan path ZIP
  2. Masukkan lokasi folder/file ZIP
`);

    while (true) {

        const choice =
            await ask(
                "Pilihan [1/2]: "
            );

        // ---------------------------------------------
        // OPTION 1
        // ---------------------------------------------

        if (choice === "1") {

            return await askZipPath();
        }

        // ---------------------------------------------
        // OPTION 2
        // ---------------------------------------------

        if (choice === "2") {

            let location =
                await ask(
                    "\nMasukkan lokasi folder/file ZIP: "
                );

            if (!location) {

                console.log(
                    "\n❌ Lokasi tidak boleh kosong."
                );

                continue;
            }

            location =
                normalizePath(
                    location
                );

            // -----------------------------------------
            // LOCATION NOT FOUND
            // -----------------------------------------

            if (!fs.existsSync(location)) {

                console.log(`
❌ Lokasi tidak ditemukan:

${location}
`);

                console.log(
                    "Silakan masukkan path ZIP secara manual."
                );

                return await askZipPath();
            }

            const stat =
                fs.statSync(
                    location
                );

            // -----------------------------------------
            // LOCATION IS FILE
            // -----------------------------------------

            if (stat.isFile()) {

                if (
                    !location
                        .toLowerCase()
                        .endsWith(".zip")
                ) {

                    console.log(
                        "\n❌ File tersebut bukan ZIP."
                    );

                    console.log(
                        "Silakan masukkan path ZIP."
                    );

                    return await askZipPath();
                }

                console.log(
                    `\n✓ ZIP ditemukan: ${location}`
                );

                return location;
            }

            // -----------------------------------------
            // LOCATION IS DIRECTORY
            // -----------------------------------------

            if (stat.isDirectory()) {

                console.log(
                    `\nMencari ZIP di:\n${location}`
                );

                zipFiles =
                    getZipFiles(
                        location
                    );

                if (
                    zipFiles.length === 0
                ) {

                    console.log(
                        "\n⚠ Tidak ada ZIP di folder tersebut."
                    );

                    console.log(
                        "Silakan masukkan path ZIP secara manual."
                    );

                    return await askZipPath();
                }

                const selected =
                    await selectZipFromDirectory(
                        location
                    );

                if (selected) {

                    return selected;
                }

                console.log(
                    "\n❌ ZIP tidak ditemukan."
                );

                return await askZipPath();
            }
        }

        console.log(
            "\n❌ Pilihan tidak valid. Gunakan 1 atau 2."
        );
    }
}

// =====================================================
// COPY ZIP
// =====================================================

function copyZip(
    zipPath,
    buildId
) {

    const destination =
        path.join(
            UPLOAD_DIR,
            `${buildId}.zip`
        );

    console.log(
        "\n[2/7] Menyalin ZIP ke repository..."
    );

    fs.copyFileSync(
        zipPath,
        destination
    );

    console.log(
        `      Source: ${zipPath}`
    );

    console.log(
        `      Destination: ${destination}`
    );

    return destination;
}

// =====================================================
// GIT PUSH
// =====================================================

function gitPush(
    zipFile,
    buildId
) {

    console.log(
        "\n[3/7] Git add..."
    );

    const relativePath =
        path.relative(
            REPO_DIR,
            zipFile
        );

    runGit([
        "add",
        "--",
        relativePath
    ]);

    console.log(
        "\n      Git status:"
    );

    try {

        const status =
            runGit([
                "status",
                "--short"
            ]);

        console.log(
            status || "      Tidak ada perubahan."
        );

    } catch {}

    console.log(
        "\n[4/7] Git commit..."
    );

    try {

        runGit([
            "commit",
            "-m",
            `Build ${buildId}`
        ]);

    } catch (error) {

        console.log(
            "      ⚠ Tidak ada perubahan baru atau commit gagal."
        );

        throw error;
    }

    console.log(
        "\n[5/7] Git push..."
    );

    try {

        runGit([
            "push",
            "origin",
            BRANCH
        ]);

    } catch (error) {

        console.error(`
❌ git push gagal.

Pastikan repository sudah terautentikasi.

Coba manual:

git push origin ${BRANCH}

`);

        throw error;
    }

    console.log(
        "      ✓ ZIP berhasil di-push ke GitHub."
    );
}

// =====================================================
// TRIGGER WORKFLOW
// =====================================================

async function triggerWorkflow(
    buildId,
    zipPath
) {

    console.log(
        "\n[6/7] Trigger workflow_dispatch..."
    );

    const createdAfter =
        new Date().toISOString();

    await octokit.rest.actions.createWorkflowDispatch({

        owner: OWNER,

        repo: REPO,

        workflow_id: WORKFLOW,

        ref: BRANCH,

        inputs: {

            build_id: buildId,

            zip_path: zipPath
        }
    });

    console.log(
        "      ✓ Workflow berhasil dijalankan."
    );

    return createdAfter;
}

// =====================================================
// FIND WORKFLOW RUN
// =====================================================

async function findWorkflowRun(
    buildId,
    createdAfter
) {

    console.log(
        "\n      Mencari workflow run..."
    );

    const after =
        new Date(
            createdAfter
        ).getTime();

    for (
        let attempt = 0;
        attempt < 30;
        attempt++
    ) {

        const response =
            await octokit.rest.actions.listWorkflowRuns({

                owner: OWNER,

                repo: REPO,

                workflow_id: WORKFLOW,

                branch: BRANCH,

                event: "workflow_dispatch",

                per_page: 20
            });

        const runs =
            response.data.workflow_runs;

        const run =
            runs.find(item => {

                const created =
                    new Date(
                        item.created_at
                    ).getTime();

                return created >= after;
            });

        if (run) {

            console.log(
                `      ✓ Run ditemukan: ${run.id}`
            );

            console.log(
                `      ${run.html_url}`
            );

            return run;
        }

        await sleep(2000);
    }

    throw new Error(
        `Workflow run tidak ditemukan setelah menunggu.

Build ID:
${buildId}`
    );
}

// =====================================================
// WAIT WORKFLOW
// =====================================================

async function waitForWorkflow(
    runId
) {

    console.log(
        "\n[7/7] Menunggu build APK..."
    );

    let lastStatus = null;

    let lastConclusion = null;

    while (true) {

        const response =
            await octokit.rest.actions.getWorkflowRun({

                owner: OWNER,

                repo: REPO,

                run_id: runId
            });

        const run =
            response.data;

        if (
            run.status !== lastStatus ||
            run.conclusion !== lastConclusion
        ) {

            console.log(
                `      Status: ${run.status}` +
                ` | Conclusion: ${run.conclusion || "-"}`
            );

            lastStatus =
                run.status;

            lastConclusion =
                run.conclusion;
        }

        if (
            run.status === "completed"
        ) {

            if (
                run.conclusion !== "success"
            ) {

                throw new Error(`
Build APK gagal.

Conclusion:
${run.conclusion}

Workflow:
${run.html_url}
`);
            }

            console.log(
                "      ✓ Build berhasil!"
            );

            return run;
        }

        await sleep(5000);
    }
}

// =====================================================
// FIND ARTIFACT
// =====================================================

async function findArtifact(
    runId
) {

    const response =
        await octokit.rest.actions.listWorkflowRunArtifacts({

            owner: OWNER,

            repo: REPO,

            run_id: runId
        });

    const artifacts =
        response.data.artifacts;

    if (
        !artifacts.length
    ) {

        throw new Error(
            "Workflow selesai tetapi artifact tidak ditemukan."
        );
    }

    console.log(
        "\n      Artifact:"
    );

    artifacts.forEach(
        (artifact, index) => {

            console.log(
                `      ${index + 1}. ` +
                `${artifact.name}` +
                ` (${formatBytes(
                    artifact.size_in_bytes
                )})`
            );
        }
    );

    let artifact =
        artifacts.find(item =>
            item.name
                .toLowerCase()
                .includes("apk")
        );

    if (!artifact) {

        artifact =
            artifacts[0];
    }

    return artifact;
}

// =====================================================
// DOWNLOAD ARTIFACT
// =====================================================

async function downloadArtifact(
    artifact,
    buildId
) {

    console.log(
        `\n      Download: ${artifact.name}`
    );

    const response =
        await octokit.rest.actions.downloadArtifact({

            owner: OWNER,

            repo: REPO,

            artifact_id: artifact.id,

            archive_format: "zip"
        });

    const output =
        path.join(
            OUTPUT_DIR,
            `${buildId}-${artifact.name}.zip`
        );

    fs.writeFileSync(
        output,
        Buffer.from(
            response.data
        )
    );

    console.log(
        "      ✓ Artifact disimpan:"
    );

    console.log(
        `      ${output}`
    );

    return output;
}

// =====================================================
// REMOVE ZIP FROM GIT REPOSITORY
// =====================================================

function removeZipFromRepository(
    zipFile,
    buildId
) {

    const relativePath =
        path.relative(
            REPO_DIR,
            zipFile
        );

    console.log(
        "\n      Membersihkan ZIP dari working tree..."
    );

    try {

        runGit([
            "rm",
            "-f",
            "--",
            relativePath
        ]);

        runGit([
            "commit",
            "-m",
            `Cleanup ${buildId}`
        ]);

        runGit([
            "push",
            "origin",
            BRANCH
        ]);

        console.log(
            "      ✓ ZIP dihapus dari branch."
        );

    } catch (error) {

        console.log(
            "      ⚠ Cleanup gagal:"
        );

        console.log(
            error.message
        );
    }
}

// =====================================================
// MAIN
// =====================================================

async function main() {

    console.log(`
╔════════════════════════════════════════════╗
║        GitHub Android APK Builder          ║
║              Git Push Edition              ║
╚════════════════════════════════════════════╝
`);

    // =================================================
    // STEP 1 - CHECK GIT
    // =================================================

    console.log(
        "[1/7] Memeriksa repository Git..."
    );

    checkGitRepository();

    checkBranch();

    // =================================================
    // STEP 1 - SELECT ZIP
    // =================================================

    const zipPath =
        await selectZip();

    if (!zipPath) {

        throw new Error(
            "ZIP project tidak ditemukan."
        );
    }

    // =================================================
    // ZIP INFO
    // =================================================

    const stat =
        fs.statSync(
            zipPath
        );

    console.log(
        `\n      ZIP: ${zipPath}`
    );

    console.log(
        `      Size: ${formatBytes(
            stat.size
        )}`
    );

    // =================================================
    // BUILD ID
    // =================================================

    const buildId =
        `build-${Date.now()}`;

    console.log(
        `      Build ID: ${buildId}`
    );

    // =================================================
    // COPY ZIP
    // =================================================

    const uploadedZip =
        copyZip(
            zipPath,
            buildId
        );

    // =================================================
    // GITHUB ZIP PATH
    // =================================================

    const githubZipPath =
        path.relative(
            REPO_DIR,
            uploadedZip
        )
        .replaceAll(
            "\\",
            "/"
        );

    console.log(
        `      GitHub ZIP path: ${githubZipPath}`
    );

    // =================================================
    // GIT PUSH
    // =================================================

    gitPush(
        uploadedZip,
        buildId
    );

    // =================================================
    // TRIGGER WORKFLOW
    // =================================================

    const createdAfter =
        await triggerWorkflow(
            buildId,
            githubZipPath
        );

    // =================================================
    // FIND RUN
    // =================================================

    const run =
        await findWorkflowRun(
            buildId,
            createdAfter
        );

    // =================================================
    // WAIT BUILD
    // =================================================

    const completedRun =
        await waitForWorkflow(
            run.id
        );

    // =================================================
    // FIND ARTIFACT
    // =================================================

    const artifact =
        await findArtifact(
            completedRun.id
        );

    // =================================================
    // DOWNLOAD
    // =================================================

    const downloaded =
        await downloadArtifact(
            artifact,
            buildId
        );

    // =================================================
    // CLEANUP
    // =================================================

    removeZipFromRepository(
        uploadedZip,
        buildId
    );

    // =================================================
    // DONE
    // =================================================

    console.log(`
╔════════════════════════════════════════════╗
║               BUILD SELESAI ✓              ║
╚════════════════════════════════════════════╝

Build ID:
${buildId}

Source ZIP:
${zipPath}

APK artifact:
${downloaded}

Workflow:
${completedRun.html_url}

`);
}

// =====================================================
// ERROR HANDLER
// =====================================================

main().catch(error => {

    console.error(`
╔════════════════════════════════════════════╗
║                  ERROR                     ║
╚════════════════════════════════════════════╝
`);

    console.error(
        error.message
    );

    process.exit(1);
});
